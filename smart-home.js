// ============================================================
// 丰和园 · 3D 全屋智能控制引擎 (SmartHome Controller)
// ============================================================

(function() {
  const FH = window.FENGHEYUAN;
  if (!FH) return;

  const SmartHome = {
    controlMode: true,       // 默认开启智控模式
    liveHomeApp: true,       // 是否同步触发真实 macOS Home.app
    syncing: false,
    filterRoom: '__all',     // 右侧面板房间筛选
    devices: FH.DEVICES.map(d => ({ ...d })),
    sensors: JSON.parse(JSON.stringify(FH.SENSORS)),
    threeCtx: null,          // { THREE, CSS2DObject, scene, lampG, labelG, furnG, wx, wz, opt, applyLight }
    lightNodes: new Map(),   // deviceId -> { pointLight, bulbMesh }
    pinNodes: new Map(),     // deviceId -> CSS2DObject

    getDevice(id) {
      return this.devices.find(d => d.id === id);
    },

    getRoomDevices(roomId) {
      if (roomId === 'living') {
        return this.devices.filter(d => d.room === 'living' || d.room === 'balcony');
      }
      if (roomId === 'kitchen') {
        return this.devices.filter(d => d.room === 'kitchen' || d.room === 'kbalc');
      }
      return this.devices.filter(d => d.room === roomId);
    },

    // 切换单个配件状态
    async toggleDevice(id, forceState) {
      const dev = this.getDevice(id);
      if (!dev) return;
      dev.on = typeof forceState === 'boolean' ? forceState : !dev.on;
      if (dev.type === 'curtain') {
        dev.statusText = dev.on ? 'Open' : 'Closed';
      }
      this.update3DVisuals();
      this.renderRightPanel();
      if (window.toast) {
        window.toast(`${dev.icon} ${dev.name} 已${dev.on ? (dev.type === 'curtain' ? '打开' : '开启') : (dev.type === 'curtain' ? '关闭' : '关闭')}`);
      }

      if (this.liveHomeApp) {
        try {
          await fetch('/api/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room: dev.homeRoom,
              name: dev.homeName,
              targetOn: dev.on
            })
          });
        } catch (err) {
          console.warn('本地 Home.app 桥接未连接，当前为纯 3D 沙盒演练:', err);
        }
      }
    },

    // 一键切换某个房间的所有主照明
    toggleRoomLights(roomId) {
      const lights = this.getRoomDevices(roomId).filter(d => d.type === 'light');
      if (!lights.length) return;
      const anyOn = lights.some(l => l.on);
      lights.forEach(l => { l.on = !anyOn; });
      this.update3DVisuals();
      this.renderRightPanel();
      if (window.toast) {
        window.toast(`${!anyOn ? '💡 已开启' : '🌑 已关闭'}该房间全部灯光 (${lights.length} 路)`);
      }
    },

    // 执行全屋场景
    async runScene(sceneKey) {
      if (sceneKey === 'home') {
        // 回家迎宾：开客厅灯、餐厅灯、玄关/字画灯、新风、主卧灯
        const onIds = ['liv_main_light', 'liv_din_light', 'liv_tv_light', 'liv_calli_light', 'liv_fresh_air', 'mas_top_light', 'stu_top_light'];
        this.devices.forEach(d => {
          if (d.type === 'light' || d.type === 'climate') d.on = onIds.includes(d.id);
        });
        if (this.threeCtx?.opt) {
          this.threeCtx.opt.night = true;
          document.querySelector('[data-t="night"]')?.classList.add('on');
        }
        window.toast && window.toast('🏠 已执行「回家迎宾」场景');
      } else if (sceneKey === 'sunset') {
        // Sunset Lighting (Home.app 原生场景)
        const warmIds = ['liv_tv_light', 'liv_desk_lamp', 'liv_color_light', 'liv_frame_light', 'kid_nanoleaf', 'stu_door_light'];
        this.devices.forEach(d => {
          if (d.type === 'light') d.on = warmIds.includes(d.id);
        });
        if (this.threeCtx?.opt) {
          this.threeCtx.opt.night = true;
          document.querySelector('[data-t="night"]')?.classList.add('on');
        }
        window.toast && window.toast('🌅 已触发 Home.app「Sunset Lighting」落日氛围场景');
        if (this.liveHomeApp) {
          fetch('/api/scene', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({scene:'Sunset Lighting'}) }).catch(()=>{});
        }
      } else if (sceneKey === 'movie') {
        // 书房 AppleTV 观影 + 客厅氛围
        this.devices.forEach(d => {
          if (d.type === 'light') d.on = ['liv_tv_light', 'liv_color_light', 'kid_nanoleaf'].includes(d.id);
          if (d.id === 'stu_appletv') d.on = true;
          if (d.id === 'stu_curtain' || d.id === 'liv_curtain') { d.on = false; d.statusText = 'Closed'; }
        });
        if (this.threeCtx?.opt) {
          this.threeCtx.opt.night = true;
          document.querySelector('[data-t="night"]')?.classList.add('on');
        }
        window.toast && window.toast('🎬 已进入「AppleTV 巨幕观影」模式');
      } else if (sceneKey === 'goodnight') {
        // 晚安场景 (Home.app 原生场景)
        this.devices.forEach(d => {
          if (d.type === 'light' || d.type === 'media' || d.type === 'climate') d.on = false;
          if (d.type === 'curtain') { d.on = false; d.statusText = 'Closed'; }
        });
        if (this.threeCtx?.opt) {
          this.threeCtx.opt.night = true;
          document.querySelector('[data-t="night"]')?.classList.add('on');
        }
        window.toast && window.toast('🌙 已执行「晚安」场景：全屋灯光与窗帘已关闭，制氧/过滤保持运行');
        if (this.liveHomeApp) {
          fetch('/api/scene', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({scene:'晚安'}) }).catch(()=>{});
        }
      }
      this.update3DVisuals();
      this.renderRightPanel();
    },

    // 从本地 Home.app 桥接服务拉取真实状态
    async syncFromHomeApp() {
      if (this.syncing) return;
      this.syncing = true;
      const syncBtn = document.getElementById('shSyncBtn');
      if (syncBtn) syncBtn.textContent = '⏳ 正在读取 Home.app...';
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (Array.isArray(data.devices)) {
          data.devices.forEach(remote => {
            const local = this.devices.find(d => d.homeRoom === remote.room && d.homeName === remote.name);
            if (local) {
              local.on = !!remote.on;
              if (remote.statusText) local.statusText = remote.statusText;
            }
          });
        }
        if (data.sensors) {
          Object.keys(data.sensors).forEach(k => {
            this.sensors[k] = Object.assign(this.sensors[k] || {}, data.sensors[k]);
          });
        }
        this.update3DVisuals();
        this.renderRightPanel();
        window.toast && window.toast('✅ 已与 macOS Home.app「丰和园」实时状态同步');
      } catch (e) {
        window.toast && window.toast('ℹ️ 当前使用内置「丰和园」快照数据 (启动 server.py 可实时同步)');
      } finally {
        this.syncing = false;
        if (syncBtn) syncBtn.textContent = '🔄 同步 Home.app';
      }
    }
  };

  window.SmartHome = SmartHome;
})();

(function() {
  const SmartHome = window.SmartHome;
  if (!SmartHome) return;

  // 绑定 Three.js 上下文并生成 3D 智能灯光节点与可点击悬浮气泡
  SmartHome.setPinsVisible = function(v) {
    this.pinNodes.forEach(pin => { pin.visible = !!(v && this.controlMode); });
  };

  SmartHome.bindThree = function(ctx) {
    this.threeCtx = ctx;
    this.rebuild3DNodes();
  };

  SmartHome.rebuild3DNodes = function() {
    const ctx = this.threeCtx;
    if (!ctx) return;
    const { THREE, CSS2DObject, lampG, wx, wz, opt } = ctx;

    // 清理旧节点
    this.pinNodes.forEach(pin => {
      pin.element?.remove();
      lampG.remove(pin);
    });
    this.pinNodes.clear();
    this.lightNodes.clear();
    lampG.clear();

    const top = opt.cut || 2.8;

    this.devices.forEach(dev => {
      const x = wx(dev.x), z = wz(dev.y), y = Math.min((dev.z || 2600) / 1000, top - 0.05);

      // 1. 如果是灯光设备，创建独立 PointLight 与发光灯体
      if (dev.type === 'light') {
        const bulbMat = new THREE.MeshStandardMaterial({
          color: '#ffffff',
          emissive: new THREE.Color(dev.color || '#ffd9a8'),
          emissiveIntensity: dev.on ? 2.4 : 0.2
        });
        const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 24), bulbMat);
        bulb.position.set(x, Math.min((dev.z || 2650) / 1000, 2.78), z);
        bulb.visible = top >= 2.6 || (dev.z && dev.z < 2000);
        bulb.userData.deviceId = dev.id;
        lampG.add(bulb);

        const pl = new THREE.PointLight(new THREE.Color(dev.color || '#ffd9a8'), dev.on ? (dev.intensity || 4.5) : 0, 7.5, 1.5);
        pl.position.set(x, Math.min(((dev.z || 2650) / 1000) - 0.2, 2.55), z);
        lampG.add(pl);
        this.lightNodes.set(dev.id, { pointLight: pl, bulbMesh: bulb });
      }

      // 2. 创建 3D 空间内可点击的悬浮胶囊按钮 (CSS2DObject)
      const pinEl = document.createElement('div');
      pinEl.className = `sh-dev-pin type-${dev.type} ${dev.on ? 'on' : ''}`;
      pinEl.dataset.devId = dev.id;
      pinEl.innerHTML = `<span>${dev.icon}</span><span>${dev.name}</span>`;
      pinEl.onclick = (e) => {
        e.stopPropagation();
        this.toggleDevice(dev.id);
      };

      const pinObj = new CSS2DObject(pinEl);
      pinObj.position.set(x, Math.min((dev.z || 1800) / 1000, top - 0.15), z);
      pinObj.visible = this.controlMode && opt.labels !== false;
      lampG.add(pinObj);
      this.pinNodes.set(dev.id, pinObj);
    });

    this.update3DVisuals();
  };

  // 构建 3D 房间顶部的传感器与状态总览卡片
  SmartHome.buildRoomCards = function(ROOMS, state, areaFn, nmFn, escFn) {
    const ctx = this.threeCtx;
    if (!ctx) return;
    const { CSS2DObject, labelG, wx, wz, opt } = ctx;

    labelG.children.slice().forEach(o => { o.element?.remove(); labelG.remove(o); });

    ROOMS.filter(r => r.at).forEach(r => {
      const roomDevs = this.getRoomDevices(r.id);
      const onLights = roomDevs.filter(d => d.type === 'light' && d.on).length;
      const totalLights = roomDevs.filter(d => d.type === 'light').length;
      const sensor = this.sensors[r.id] || {};

      const el = document.createElement('div');
      el.className = `rlabel sh-room-card ${onLights > 0 ? 'lit' : ''}`;
      el.dataset.roomId = r.id;

      const sensorTags = [];
      if (sensor.temp) sensorTags.push(`🌡️ ${sensor.temp}`);
      if (sensor.humidity) sensorTags.push(`💧 ${sensor.humidity}`);
      if (sensor.lux) sensorTags.push(`☀️ ${sensor.lux}`);
      if (sensor.air) sensorTags.push(`🍃 ${sensor.air}`);
      if (sensor.power) sensorTags.push(`⚡ ${sensor.power}`);
      if (!sensorTags.length) sensorTags.push(`${areaFn(r.poly).toFixed(1)} m²`);

      const badgeText = totalLights > 0 ? `💡 ${onLights}/${totalLights}` : `${areaFn(r.poly).toFixed(1)}m²`;

      el.innerHTML = `
        <div class="sh-rc-head">
          <span>${escFn(nmFn(state.rooms[r.id]?.name || r.name))}</span>
          <span class="sh-rc-badge" title="点击快速开关房间主灯">${badgeText}</span>
        </div>
        <div class="sh-rc-sensors">${sensorTags.map(t => `<span>${t}</span>`).join('')}</div>
      `;

      el.onclick = (e) => {
        e.stopPropagation();
        this.filterRoom = r.id;
        this.toggleRoomLights(r.id);
        if (window.View3D?.flyToRoom) window.View3D.flyToRoom(r.id);
      };

      const obj = new CSS2DObject(el);
      obj.position.set(wx(r.at[0]), (opt.cut || 2.8) + 0.22, wz(r.at[1]));
      obj.visible = opt.labels !== false;
      labelG.add(obj);
    });
  };

  // 实时刷新 3D 灯光强度、环境暗度、悬浮气泡与房间卡片高亮
  SmartHome.update3DVisuals = function() {
    const ctx = this.threeCtx;
    if (!ctx) return;
    const { opt, sun, hemi, scene, ground, renderer, labelG } = ctx;

    const anyLightOn = this.devices.some(d => d.type === 'light' && d.on);

    // 更新每盏 PointLight
    this.devices.forEach(dev => {
      const ln = this.lightNodes.get(dev.id);
      if (ln) {
        ln.pointLight.intensity = dev.on ? (dev.intensity || 4.8) : 0;
        ln.bulbMesh.material.emissiveIntensity = dev.on ? 2.6 : 0.18;
      }
      const pin = this.pinNodes.get(dev.id);
      if (pin) {
        pin.visible = this.controlMode && opt.labels !== false;
        pin.element.className = `sh-dev-pin type-${dev.type} ${dev.on ? 'on' : ''}`;
        const st = dev.type === 'curtain' ? (dev.on ? '开' : '关') : (dev.on ? 'ON' : '');
        pin.element.innerHTML = `<span>${dev.icon}</span><span>${dev.name}${st ? ' · ' + st : ''}</span>`;
      }
    });

    // 如果处于夜景或有室内灯光开启，营造真实室内柔和辉光对比
    if (sun && hemi && scene && ground && renderer) {
      const isNight = opt.night || anyLightOn;
      if (isNight) {
        sun.intensity = opt.night ? 0.06 : 0.55;
        hemi.intensity = opt.night ? 0.16 : 0.48;
        scene.background.setHex(opt.night ? 0x161b26 : 0x232938);
        ground.material.color.setHex(opt.night ? 0x1f2430 : 0x2c3240);
        renderer.toneMappingExposure = 1.22;
      }
    }

    // 刷新房间卡片亮灯计数
    if (labelG) {
      labelG.children.forEach(o => {
        const rid = o.element?.dataset?.roomId;
        if (!rid) return;
        const roomDevs = this.getRoomDevices(rid);
        const onLights = roomDevs.filter(d => d.type === 'light' && d.on).length;
        const totalLights = roomDevs.filter(d => d.type === 'light').length;
        o.element.classList.toggle('lit', onLights > 0);
        const badge = o.element.querySelector('.sh-rc-badge');
        if (badge && totalLights > 0) badge.textContent = `💡 ${onLights}/${totalLights}`;
      });
    }
  };
})();

(function() {
  const SmartHome = window.SmartHome;
  const FH = window.FENGHEYUAN;
  if (!SmartHome || !FH) return;

  // 在右侧抽屉渲染「丰和园 · Home.app 全屋智控中心」
  SmartHome.renderRightPanel = function() {
    if (!this.controlMode) return false;
    const panel = document.getElementById('panel');
    if (!panel) return false;

    const totalLights = this.devices.filter(d => d.type === 'light');
    const onLights = totalLights.filter(d => d.on).length;
    const openCurtains = this.devices.filter(d => d.type === 'curtain' && d.on).length;
    const livSensor = this.sensors.living || {};

    const rooms = [
      { id: '__all', name: '全屋' },
      { id: 'living', name: '客厅' },
      { id: 'study', name: '书房' },
      { id: 'master', name: '主卧' },
      { id: 'kid', name: '儿童房' },
      { id: 'kitchen', name: '厨房' },
      { id: 'bath', name: '卫生间' },
      { id: 'utility', name: '家政/生态' }
    ];

    const list = this.filterRoom === '__all'
      ? this.devices
      : this.getRoomDevices(this.filterRoom);

    panel.innerHTML = `
      <div class="psec sh-panel-wrap">
        <div class="sh-status-banner">
          <div class="sh-status-top">
            <span>🏠 丰和园 · 全屋智能中控</span>
            <span style="font-size:11px;color:#93c5fd">💡 ${onLights}/${totalLights.length} 开启</span>
          </div>
          <div class="sh-status-metrics">
            <span>🌡️ 客厅 ${livSensor.temp || '22–27°C'}</span>
            <span>💧 湿度 ${livSensor.humidity || '29–32%'}</span>
            <span>☀️ 光照 ${livSensor.lux || '5,800 lx'}</span>
            <span>🪟 窗帘 ${openCurtains} 路开启</span>
          </div>
        </div>

        <div>
          <div class="ptitle" style="margin-bottom:6px">全屋场景 (Home.app Scenes)</div>
          <div class="sh-scene-grid">
            <button class="sh-scene-btn" data-scene="home">🏠 回家迎宾<br><small style="color:#78716c">客厅/主卧/新风开启</small></button>
            <button class="sh-scene-btn" data-scene="sunset">🌅 Sunset 落日<br><small style="color:#78716c">同步 Home 落日氛围</small></button>
            <button class="sh-scene-btn" data-scene="movie">🎬 AppleTV 观影<br><small style="color:#78716c">合窗帘+开投影氛围</small></button>
            <button class="sh-scene-btn" data-scene="goodnight">🌙 晚安总关<br><small style="color:#78716c">同步 Home 晚安场景</small></button>
          </div>
        </div>

        <div>
          <div class="ptitle" style="margin-bottom:6px">按房间筛选配件</div>
          <div class="seg" style="display:flex;flex-wrap:wrap;gap:4px">
            ${rooms.map(r => `<button class="btn ${this.filterRoom === r.id ? 'on' : ''}" data-sh-room="${r.id}" style="flex:1 0 22%;font-size:11.5px;padding:4px 0">${r.name}</button>`).join('')}
          </div>
        </div>

        <div>
          <div class="ptitle" style="margin-bottom:6px">配件列表 (${list.length}) · 点击直接控制</div>
          <div class="sh-dev-grid">
            ${list.map(d => {
              const stText = d.type === 'curtain'
                ? (d.on ? '已打开 (Open)' : '已关闭 (Closed)')
                : (d.on ? '已开启 (On)' : '已关闭 (Off)');
              return `
                <div class="sh-dev-tile ${d.on ? 'on' : ''}" data-sh-dev="${d.id}">
                  <div class="sh-dev-tile-top">
                    <span>${d.icon} ${d.name}</span>
                  </div>
                  <div class="sh-dev-tile-sub">${d.homeRoom} · ${stText}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    panel.querySelectorAll('[data-scene]').forEach(btn => {
      btn.onclick = () => this.runScene(btn.dataset.scene);
    });
    panel.querySelectorAll('[data-sh-room]').forEach(btn => {
      btn.onclick = () => {
        this.filterRoom = btn.dataset.shRoom;
        this.renderRightPanel();
        if (this.filterRoom !== '__all' && window.View3D?.flyToRoom) {
          window.View3D.flyToRoom(this.filterRoom);
        }
      };
    });
    panel.querySelectorAll('[data-sh-dev]').forEach(tile => {
      tile.onclick = () => this.toggleDevice(tile.dataset.shDev);
    });

    return true;
  };

  // 注入顶栏智控按钮
  SmartHome.initTopBar = function() {
    const topRight = document.querySelector('.top-r');
    if (!topRight || document.getElementById('shTopBar')) return;

    const bar = document.createElement('div');
    bar.id = 'shTopBar';
    bar.className = 'sh-top-bar';
    bar.innerHTML = `
      <button id="shModeBtn" class="sh-btn active" title="切换 3D 全屋智能控制 / 装修设计模式">⚡ 全屋智控</button>
      <button id="shLiveBtn" class="sh-btn live-on" title="开启后点击网页直接真实控制本机 macOS Home.app 设备">
        <span class="sh-dot"></span><span id="shLiveTxt">联动 Home.app</span>
      </button>
      <button id="shSyncBtn" class="sh-btn" title="立即从 macOS Home.app 同步最新传感器与开关状态">🔄 同步 Home.app</button>
    `;
    topRight.prepend(bar);

    const modeBtn = document.getElementById('shModeBtn');
    modeBtn.onclick = () => {
      this.controlMode = !this.controlMode;
      modeBtn.classList.toggle('active', this.controlMode);
      modeBtn.textContent = this.controlMode ? '⚡ 全屋智控' : '🛠️ 布局设计';
      this.update3DVisuals();
      if (this.controlMode) {
        this.renderRightPanel();
      } else if (window.renderPanel) {
        window.renderPanel();
      }
    };

    const liveBtn = document.getElementById('shLiveBtn');
    const liveTxt = document.getElementById('shLiveTxt');
    liveBtn.onclick = () => {
      this.liveHomeApp = !this.liveHomeApp;
      liveBtn.classList.toggle('live-on', this.liveHomeApp);
      liveTxt.textContent = this.liveHomeApp ? '联动 Home.app' : '纯 3D 沙盒';
      window.toast && window.toast(this.liveHomeApp ? '🟢 已开启真实 Home.app 硬件联动' : '🟡 已切换为纯 3D 沙盒演示 (不影响真实设备)');
    };

    document.getElementById('shSyncBtn').onclick = () => this.syncFromHomeApp();
  };
})();
