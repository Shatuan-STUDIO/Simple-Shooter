// 游戏状态
const GameState = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    DEAD: 'dead'
};

// 游戏控制模式
const ControlMode = {
    PC: 'pc',
    MOBILE: 'mobile'
};

// 游戏类
class Game {
    constructor() {
        this.state = GameState.MENU;
        this.controlMode = ControlMode.PC;
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.player = null;
        this.players = {};
        this.npcs = {};
        this.bosses = {};
        this.bullets = [];
        this.rays = [];
        this.particles = [];
        this.stars = [];
        this.camera = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0, isDown: false, rightDown: false };
        this.keys = {};
        this.mobileKeys = { up: false, down: false, left: false, right: false };
        this.lastFireTime = 0;
        this.lastRayTime = 0;
        this.rayCharging = false;
        this.rayChargeStart = 0;
        this.gameConfig = {};
        
        this.init();
    }
    
    init() {
        // 获取DOM元素
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 设置画布大小
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // 初始化星空背景
        this.initStars();
        
        // 绑定事件
        this.bindEvents();
        
        // 开始游戏循环
        this.gameLoop();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    initStars() {
        // 创建星空背景
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: Math.random() * 2000 - 1000,
                y: Math.random() * 2000 - 1000,
                size: Math.random() * 2 + 0.5,
                brightness: Math.random() * 0.8 + 0.2
            });
        }
    }
    
    bindEvents() {
        // 连接按钮
        document.getElementById('connect-btn').addEventListener('click', () => this.connect());
        
        // 回车键连接
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connect();
        });
        
        // 暂停按钮
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('resume-btn').addEventListener('click', () => this.resume());
        
        // 控制模式切换
        document.getElementById('control-mode-btn').addEventListener('click', () => this.toggleControlMode());
        
        // 连接控制
        document.getElementById('reconnect-btn').addEventListener('click', () => this.reconnect());
        document.getElementById('disconnect-btn').addEventListener('click', () => this.disconnect());
        
        // 玩家信息
        document.getElementById('close-info-btn').addEventListener('click', () => {
            document.getElementById('player-info-modal').classList.add('hidden');
        });
        
        // 错误提示
        document.getElementById('close-error-btn').addEventListener('click', () => {
            document.getElementById('error-toast').classList.add('hidden');
        });
        
        // 鼠标事件
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.mouse.isDown = true;
            } else if (e.button === 2) {
                e.preventDefault();
                this.mouse.rightDown = true;
                this.startRayCharge();
            }
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.isDown = false;
            } else if (e.button === 2) {
                e.preventDefault();
                this.mouse.rightDown = false;
                this.fireRay();
            }
        });
        
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // 键盘事件
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        
        // 移动端控制
        this.setupMobileControls();
    }
    
    setupMobileControls() {
        // 创建移动端控制元素
        const mobileControls = document.createElement('div');
        mobileControls.className = 'mobile-controls';
        mobileControls.innerHTML = `
            <div class="control-pad">
                <div class="control-btn control-up" data-key="up">↑</div>
                <div class="control-btn control-right" data-key="right">→</div>
                <div class="control-btn control-down" data-key="down">↓</div>
                <div class="control-btn control-left" data-key="left">←</div>
                <div class="fire-btn">FIRE</div>
            </div>
        `;
        document.body.appendChild(mobileControls);
        
        // 绑定移动端控制事件
        const controlBtns = mobileControls.querySelectorAll('.control-btn');
        controlBtns.forEach(btn => {
            const key = btn.getAttribute('data-key');
            
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.mobileKeys[key] = true;
            });
            
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.mobileKeys[key] = false;
            });
            
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.mobileKeys[key] = true;
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.mobileKeys[key] = false;
            });
        });
        
        const fireBtn = mobileControls.querySelector('.fire-btn');
        fireBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.mouse.isDown = true;
        });
        
        fireBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.mouse.isDown = false;
        });
        
        fireBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.mouse.isDown = true;
        });
        
        fireBtn.addEventListener('mouseup', (e) => {
            e.preventDefault();
            this.mouse.isDown = false;
        });
        
        // 长按发射激光
        let rayTimer;
        fireBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRayCharge();
            rayTimer = setTimeout(() => {
                this.fireRay();
            }, this.gameConfig.laser_charge_max_time || 7000);
        });
        
        fireBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            clearTimeout(rayTimer);
            this.fireRay();
        });
    }
    
    connect() {
        // 检查Socket.IO是否可用
        if (typeof io === 'undefined') {
            this.showError('Socket.IO库未加载，请刷新页面重试');
            return;
        }
        
        const serverIP = document.getElementById('server-ip').value.trim();
        const serverPort = document.getElementById('server-port').value.trim();
        const username = document.getElementById('username').value.trim();
        
        // 验证输入
        if (!serverIP || !serverPort || !username) {
            this.showError('请填写所有字段');
            return;
        }
        
        if (username.length > 16) {
            this.showError('用户名不能超过16个字符');
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            this.showError('用户名只能包含字母、数字和下划线');
            return;
        }
        
        // 显示连接状态
        const statusEl = document.getElementById('connection-status');
        statusEl.textContent = '正在连接...';
        statusEl.className = 'status-message info';
        
        // 连接服务器
        try {
            // 检查是否为localhost或IP地址
            let serverURL;
            if (serverIP === 'localhost' || serverIP === '127.0.0.1') {
                serverURL = `http://${serverIP}:${serverPort}`;
            } else {
                // 如果是域名，直接使用
                serverURL = `http://${serverIP}:${serverPort}`;
            }
            
            console.log('尝试连接到:', serverURL);
            this.socket = io(serverURL, {
                timeout: 5000,
                forceNew: true
            });
            
            // 连接成功
            this.socket.on('connect', () => {
                statusEl.textContent = '连接成功，正在加入游戏...';
                statusEl.className = 'status-message success';
                
                // 加入游戏
                this.socket.emit('join_game', { username });
            });
            
            // 加入成功
            this.socket.on('join_success', (data) => {
                this.player = data.player;
                this.gameConfig = data.config;
                
                // 切换到游戏界面
                document.getElementById('main-menu').classList.add('hidden');
                document.getElementById('game-screen').classList.remove('hidden');
                
                this.state = GameState.PLAYING;
                
                // 更新玩家列表
                this.updatePlayerList();
                
                // 更新分数
                this.updateScore();
                
                // 检测是否是移动设备
                if (this.isMobileDevice()) {
                    this.controlMode = ControlMode.MOBILE;
                    document.querySelector('.mobile-controls').classList.add('active');
                }
            });
            
            // 加入失败
            this.socket.on('join_error', (data) => {
                statusEl.textContent = `连接失败: ${data.message}`;
                statusEl.className = 'status-message error';
                this.socket.disconnect();
            });
            
            // 被封禁
            this.socket.on('banned', (data) => {
                const expires = data.expires === 0 ? '永久' : new Date(data.expires).toLocaleString();
                statusEl.textContent = `您已被封禁: ${data.reason} (到期时间: ${expires})`;
                statusEl.className = 'status-message error';
                this.socket.disconnect();
            });
            
            // 被踢出
            this.socket.on('kicked', (data) => {
                this.showError(`您已被踢出: ${data.reason}`);
                this.disconnect();
            });
            
            // 服务器关闭
            this.socket.on('server_shutdown', () => {
                this.showError('服务器已关闭');
                this.disconnect();
            });
            
            // 游戏状态更新
            this.socket.on('game_state', (data) => {
                // 只在初始连接时更新NPC和BOSS
                // 玩家列表由player_joined和player_left事件处理
                this.npcs = data.npcs;
                this.bosses = data.bosses;
                
                // 初始玩家列表，排除当前玩家
                if (Object.keys(this.players).length === 0 && this.player) {
                    // 过滤掉当前玩家
                    for (const [id, player] of Object.entries(data.players)) {
                        if (id !== this.player.id) {
                            this.players[id] = player;
                        }
                    }
                    this.updatePlayerList();
                }
            });
            
            // 玩家加入
            this.socket.on('player_joined', (data) => {
                this.players[data.player.id] = data.player;
                this.updatePlayerList();
            });
            
            // 玩家离开
            this.socket.on('player_left', (data) => {
                delete this.players[data.playerId];
                this.updatePlayerList();
            });
            
            // 玩家移动
            this.socket.on('player_moved', (data) => {
                if (this.players[data.playerId]) {
                    this.players[data.playerId].x = data.x;
                    this.players[data.playerId].y = data.y;
                }
            });
            
            // 子弹发射
            this.socket.on('bullet_fired', (data) => {
                this.bullets.push(data);
            });
            
            // 激光发射
            this.socket.on('ray_fired', (data) => {
                this.rays.push(data);
            });
            
            // NPC更新
            this.socket.on('npcs_update', (data) => {
                this.npcs = data;
            });
            
            // BOSS更新
            this.socket.on('bosses_update', (data) => {
                this.bosses = data;
            });
            
            // NPC被击中
            this.socket.on('npc_hit', (data) => {
                if (this.npcs[data.id]) {
                    this.createParticles(this.npcs[data.id].x, this.npcs[data.id].y, '#ff4444', 5);
                }
            });
            
            // NPC被摧毁
            this.socket.on('npc_destroyed', (data) => {
                if (this.npcs[data.id]) {
                    this.createExplosion(this.npcs[data.id].x, this.npcs[data.id].y);
                    delete this.npcs[data.id];
                }
            });
            
            // BOSS被击中
            this.socket.on('boss_hit', (data) => {
                if (this.bosses[data.id]) {
                    this.createParticles(this.bosses[data.id].x, this.bosses[data.id].y, '#aa44ff', 10);
                }
            });
            
            // BOSS被摧毁
            this.socket.on('boss_destroyed', (data) => {
                if (this.bosses[data.id]) {
                    this.createBigExplosion(this.bosses[data.id].x, this.bosses[data.id].y);
                    delete this.bosses[data.id];
                }
            });
            
            // BOSS激光警告
            this.socket.on('boss_laser_warning', (data) => {
                // 显示警告效果
                this.createBossLaserWarning(data.x, data.y);
            });
            
            // BOSS激光发射
            this.socket.on('boss_laser_fire', (data) => {
                // 创建BOSS激光
                this.createBossLaser(data.x, data.y);
            });
            
            // 玩家被击中
            this.socket.on('player_hit', (data) => {
                if (this.player && this.player.id === data.playerId) {
                    // 使用服务器发送的血量，而不是本地计算
                    this.player.hp = data.currentHp || Math.max(0, this.player.hp - data.damage);
                    this.createParticles(this.player.x, this.player.y, '#ff4444', 10);
                    
                    if (this.player.hp <= 0) {
                        this.state = GameState.DEAD;
                        document.getElementById('death-screen').classList.remove('hidden');
                        
                        // 3秒后自动重连
                        setTimeout(() => {
                            location.reload();
                        }, 3000);
                    }
                } else if (this.players[data.playerId]) {
                    // 更新其他玩家的血量
                    this.players[data.playerId].hp = data.currentHp || Math.max(0, this.players[data.playerId].hp - data.damage);
                    this.createParticles(this.players[data.playerId].x, this.players[data.playerId].y, '#ff4444', 10);
                }
            });
            
            // 玩家死亡
            this.socket.on('player_death', (data) => {
                if (this.player && this.player.id === data.playerId) {
                    this.state = GameState.DEAD;
                    document.getElementById('death-screen').classList.remove('hidden');
                    
                    // 3秒后自动重连
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                } else if (this.players[data.playerId]) {
                    // 标记其他玩家为死亡状态
                    this.players[data.playerId].alive = false;
                }
            });
            
            // 玩家复活（不再使用，因为死亡后直接重连）
            this.socket.on('player_revive', () => {
                // 不再处理复活事件，因为玩家死亡后直接重连
            });
            
            // 玩家复活通知（其他玩家）
            this.socket.on('player_revived', (data) => {
                if (this.players[data.playerId]) {
                    this.players[data.playerId].alive = true;
                    this.players[data.playerId].invincible = data.invincible;
                    this.players[data.playerId].hp = data.hp;
                    this.players[data.playerId].maxHp = data.maxHp;
                    this.players[data.playerId].x = data.x;
                    this.players[data.playerId].y = data.y;
                }
            });
            
            // 玩家无敌时间结束
            this.socket.on('player_invincibility_ended', (data) => {
                if (this.player && this.player.id === data.playerId) {
                    this.player.invincible = false;
                } else if (this.players[data.playerId]) {
                    this.players[data.playerId].invincible = false;
                }
            });
            
            // 玩家无敌时间开始
            this.socket.on('player_invincibility_started', (data) => {
                if (this.player && this.player.id === data.playerId) {
                    this.player.invincible = true;
                } else if (this.players[data.playerId]) {
                    this.players[data.playerId].invincible = true;
                }
            });
            
            // 积分更新
            this.socket.on('score_updated', (data) => {
                if (this.player && this.player.id === data.playerId) {
                    this.player.score = data.score;
                    this.updateScore();
                } else if (this.players[data.playerId]) {
                    this.players[data.playerId].score = data.score;
                }
            });
            
            // 清除NPC和BOSS
            this.socket.on('clear_npcs_bosses', () => {
                this.npcs = {};
                this.bosses = {};
            });
            
            // 连接错误
            this.socket.on('connect_error', (error) => {
                console.error('连接错误:', error);
                let errorMessage = '连接失败: ';
                
                if (error.description === 'timeout') {
                    errorMessage += '连接超时，请检查服务器地址和端口是否正确';
                } else if (error.description === 'not found') {
                    errorMessage += '找不到服务器，请检查服务器地址和端口是否正确';
                } else if (error.message.includes('ECONNREFUSED')) {
                    errorMessage += '连接被拒绝，请检查服务器是否运行';
                } else if (error.message.includes('ENOTFOUND')) {
                    errorMessage += '找不到主机，请检查服务器地址是否正确';
                } else {
                    errorMessage += error.message || '未知错误';
                }
                
                statusEl.textContent = errorMessage;
                statusEl.className = 'status-message error';
            });
            
            // 断开连接
            this.socket.on('disconnect', () => {
                this.showError('与服务器断开连接');
                this.disconnect();
            });
            
        } catch (error) {
            console.error('连接异常:', error);
            statusEl.textContent = '连接失败: ' + error.message;
            statusEl.className = 'status-message error';
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.player = null;
        this.players = {};
        this.npcs = {};
        this.bosses = {};
        this.bullets = [];
        this.rays = [];
        this.particles = [];
        
        this.state = GameState.MENU;
        
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('death-screen').classList.add('hidden');
        document.getElementById('player-info-modal').classList.add('hidden');
        
        document.querySelector('.mobile-controls').classList.remove('active');
    }
    
    reconnect() {
        this.disconnect();
        this.connect();
    }
    
    togglePause() {
        if (this.state === GameState.PLAYING) {
            this.state = GameState.PAUSED;
            document.getElementById('pause-menu').classList.remove('hidden');
        } else if (this.state === GameState.PAUSED) {
            this.resume();
        }
    }
    
    resume() {
        if (this.state === GameState.PAUSED) {
            this.state = GameState.PLAYING;
            document.getElementById('pause-menu').classList.add('hidden');
        }
    }
    
    toggleControlMode() {
        if (this.controlMode === ControlMode.PC) {
            this.controlMode = ControlMode.MOBILE;
            document.querySelector('.mobile-controls').classList.add('active');
        } else {
            this.controlMode = ControlMode.PC;
            document.querySelector('.mobile-controls').classList.remove('active');
        }
    }
    
    updatePlayerList() {
        const listContent = document.getElementById('player-list-content');
        listContent.innerHTML = '';
        
        // 添加当前玩家
        if (this.player) {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.innerHTML = `
                <div class="player-name">${this.player.username} (你)</div>
                <div class="player-ip">${this.player.ip}</div>
            `;
            playerItem.addEventListener('click', () => this.showPlayerInfo(this.player));
            listContent.appendChild(playerItem);
        }
        
        // 添加其他玩家
        for (const player of Object.values(this.players)) {
            if (this.player && player.id === this.player.id) continue;
            
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.innerHTML = `
                <div class="player-name">${player.username}</div>
                <div class="player-ip">${player.ip}</div>
            `;
            playerItem.addEventListener('click', () => this.showPlayerInfo(player));
            listContent.appendChild(playerItem);
        }
    }
    
    updateScore() {
        if (this.player) {
            document.getElementById('score-value').textContent = this.player.score || 0;
        }
    }
    
    showPlayerInfo(player) {
        document.getElementById('info-username').textContent = player.username;
        document.getElementById('info-ip').textContent = player.ip;
        document.getElementById('info-level').textContent = player.level || 1;
        document.getElementById('info-score').textContent = player.score || 0;
        document.getElementById('info-kills').textContent = player.kills || 0;
        document.getElementById('info-boss-kills').textContent = player.bossKills || 0;
        document.getElementById('info-player-kills').textContent = player.playerKills || 0;
        
        document.getElementById('player-info-modal').classList.remove('hidden');
    }
    
    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-toast').classList.remove('hidden');
        
        // 3秒后自动关闭
        setTimeout(() => {
            document.getElementById('error-toast').classList.add('hidden');
        }, 3000);
    }
    
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    startRayCharge() {
        if (this.state !== GameState.PLAYING || !this.player || !this.player.alive) return;
        
        const now = Date.now();
        const cooldownTime = this.gameConfig.laser_cooldown_time || 14000;
        
        if (now - this.lastRayTime < cooldownTime) return;
        
        this.rayCharging = true;
        this.rayChargeStart = now;
    }
    
    fireRay() {
        if (!this.rayCharging || this.state !== GameState.PLAYING || !this.player || !this.player.alive) return;
        
        const now = Date.now();
        const chargeTime = Math.min(now - this.rayChargeStart, this.gameConfig.laser_charge_max_time || 7000);
        
        // 计算角度
        const rect = this.canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const angle = Math.atan2(this.mouse.y - centerY, this.mouse.x - centerX);
        
        // 发送激光事件
        if (this.socket) {
            this.socket.emit('player_ray', {
                playerId: this.player.id,
                x: this.player.x,
                y: this.player.y,
                angle,
                chargeTime
            });
        }
        
        this.lastRayTime = now;
        this.rayCharging = false;
    }
    
    update() {
        if ((this.state !== GameState.PLAYING && this.state !== GameState.DEAD) || !this.player) return;
        
        // 处理输入
        let dx = 0, dy = 0;
        const speed = this.gameConfig.player_move_speed || 5;
        
        // 只有在玩家存活时才能移动
        if (this.state === GameState.PLAYING && this.player.alive) {
            if (this.controlMode === ControlMode.PC) {
                if (this.keys['w']) dy -= speed;
                if (this.keys['s']) dy += speed;
                if (this.keys['a']) dx -= speed;
                if (this.keys['d']) dx += speed;
            } else {
                if (this.mobileKeys.up) dy -= speed;
                if (this.mobileKeys.down) dy += speed;
                if (this.mobileKeys.left) dx -= speed;
                if (this.mobileKeys.right) dx += speed;
            }
        }
        
        // 更新玩家位置
        if (dx !== 0 || dy !== 0) {
            this.player.x += dx;
            this.player.y += dy;
            
            // 限制在地图范围内
            const mapSize = 1000;
            this.player.x = Math.max(-mapSize, Math.min(mapSize, this.player.x));
            this.player.y = Math.max(-mapSize, Math.min(mapSize, this.player.y));
            
            // 发送位置更新
            if (this.socket) {
                this.socket.emit('player_move', {
                    playerId: this.player.id,
                    x: this.player.x,
                    y: this.player.y
                });
            }
        }
        
        // 处理射击
        const now = Date.now();
        const fireRate = this.gameConfig.bullet_fire_rate || 200;
        
        // 只有在玩家存活时才能射击
        if (this.state === GameState.PLAYING && this.player.alive && this.mouse.isDown && now - this.lastFireTime >= fireRate) {
            // 计算角度
            const rect = this.canvas.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const angle = Math.atan2(this.mouse.y - centerY, this.mouse.x - centerX);
            
            // 发送子弹事件
            if (this.socket) {
                this.socket.emit('player_shoot', {
                    playerId: this.player.id,
                    x: this.player.x,
                    y: this.player.y,
                    angle
                });
            }
            
            this.lastFireTime = now;
            
            // 创建子弹粒子效果
            this.createParticles(this.player.x, this.player.y, '#4488ff', 3);
        }
        
        // 更新相机位置
        // 在观战模式下仍然跟随玩家
        if (this.player) {
            this.camera.x = this.player.x;
            this.camera.y = this.player.y;
        }
        
        // 更新分数
        this.updateScore();
    }
    
    render() {
        // 清空画布
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 保存上下文状态
        this.ctx.save();
        
        // 应用相机变换
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(1, 1);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // 绘制星空背景
        this.renderStars();
        
        // 绘制NPC
        this.renderNPCs();
        
        // 绘制BOSS
        this.renderBosses();
        
        // 绘制玩家
        this.renderPlayers();
        
        // 绘制子弹
        this.renderBullets();
        
        // 绘制激光
        this.renderRays();
        
        // 绘制粒子效果
        this.renderParticles();
        
        // 恢复上下文状态
        this.ctx.restore();
        
        // 绘制UI元素
        this.renderUI();
    }
    
    renderStars() {
        this.ctx.fillStyle = '#ffffff';
        for (const star of this.stars) {
            this.ctx.globalAlpha = star.brightness;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
    }
    
    renderPlayers() {
        for (const player of Object.values(this.players)) {
            // 跳过死亡的玩家
            if (!player.alive) continue;
            
            // 计算屏幕位置
            const x = player.x;
            const y = player.y;
            
            // 绘制玩家
            this.ctx.fillStyle = '#4488ff';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制玩家边框
            this.ctx.strokeStyle = '#88bbff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制玩家名称和IP
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.username, x, y - 30);
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#a5b4fc';
            this.ctx.fillText(player.ip, x, y - 18);
            
            // 绘制血条
            const barWidth = 40;
            const barHeight = 4;
            const barY = y - 25;
            
            // 血条背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth, barHeight);
            
            // 血条
            const hpPercent = player.hp / player.maxHp;
            this.ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth * hpPercent, barHeight);
        }
        
        // 绘制当前玩家
        if (this.player && this.player.alive) {
            const x = this.player.x;
            const y = this.player.y;
            
            // 绘制玩家
            this.ctx.fillStyle = '#4488ff';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制玩家边框
            this.ctx.strokeStyle = '#88bbff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制玩家名称和IP
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.player.username + ' (你)', x, y - 30);
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#a5b4fc';
            this.ctx.fillText(this.player.ip, x, y - 18);
            
            // 绘制血条
            const barWidth = 40;
            const barHeight = 4;
            const barY = y - 25;
            
            // 血条背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth, barHeight);
            
            // 血条
            const hpPercent = this.player.hp / this.player.maxHp;
            this.ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth * hpPercent, barHeight);
            
            // 绘制激光充能效果
            if (this.rayCharging) {
                const chargeTime = Date.now() - this.rayChargeStart;
                const chargePercent = Math.min(1, chargeTime / (this.gameConfig.laser_charge_max_time || 7000));
                
                // 计算角度
                const rect = this.canvas.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const angle = Math.atan2(this.mouse.y - centerY, this.mouse.x - centerX);
                
                // 绘制充能效果
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + chargePercent * 0.7})`;
                this.ctx.lineWidth = 2 + chargePercent * 8;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(
                    x + Math.cos(angle) * (50 + chargePercent * 100),
                    y + Math.sin(angle) * (50 + chargePercent * 100)
                );
                this.ctx.stroke();
            }
        }
    }
    
    renderNPCs() {
        for (const npc of Object.values(this.npcs)) {
            const x = npc.x;
            const y = npc.y;
            
            // 绘制NPC
            this.ctx.fillStyle = '#ff4444';
            this.ctx.fillRect(x - 15, y - 15, 30, 30);
            
            // 绘制NPC边框
            this.ctx.strokeStyle = '#ff8888';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x - 15, y - 15, 30, 30);
            
            // 绘制血条
            const barWidth = 30;
            const barHeight = 4;
            const barY = y - 25;
            
            // 血条背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth, barHeight);
            
            // 血条
            const hpPercent = npc.hp / npc.maxHp;
            this.ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth * hpPercent, barHeight);
        }
    }
    
    renderBosses() {
        for (const boss of Object.values(this.bosses)) {
            const x = boss.x;
            const y = boss.y;
            
            // 绘制BOSS
            this.ctx.fillStyle = '#aa44ff';
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i;
                const px = x + Math.cos(angle) * 30;
                const py = y + Math.sin(angle) * 30;
                if (i === 0) {
                    this.ctx.moveTo(px, py);
                } else {
                    this.ctx.lineTo(px, py);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
            
            // 绘制BOSS边框
            this.ctx.strokeStyle = '#cc88ff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制血条
            const barWidth = 60;
            const barHeight = 6;
            const barY = y - 40;
            
            // 血条背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth, barHeight);
            
            // 血条
            const hpPercent = boss.hp / boss.maxHp;
            this.ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#fbbf24' : '#ef4444';
            this.ctx.fillRect(x - barWidth/2, barY, barWidth * hpPercent, barHeight);
        }
    }
    
    renderBullets() {
        for (const bullet of this.bullets) {
            // 更新子弹位置
            bullet.x += Math.cos(bullet.angle) * bullet.speed;
            bullet.y += Math.sin(bullet.angle) * bullet.speed;
            
            // 绘制子弹
            this.ctx.fillStyle = '#4488ff';
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制子弹光晕
            this.ctx.fillStyle = 'rgba(68, 136, 255, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, 10, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // 移除超出范围的子弹
        this.bullets = this.bullets.filter(bullet => {
            const distance = Math.sqrt(Math.pow(bullet.x - this.camera.x, 2) + Math.pow(bullet.y - this.camera.y, 2));
            return distance < 1000;
        });
    }
    
    renderRays() {
        for (const ray of this.rays) {
            // 计算激光终点
            const endX = ray.x + Math.cos(ray.angle) * 1000;
            const endY = ray.y + Math.sin(ray.angle) * 1000;
            
            // 绘制激光
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = ray.width;
            this.ctx.beginPath();
            this.ctx.moveTo(ray.x, ray.y);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
            
            // 绘制激光光晕
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = ray.width * 2;
            this.ctx.beginPath();
            this.ctx.moveTo(ray.x, ray.y);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        }
        
        // 移除旧的激光
        this.rays = this.rays.filter(ray => Date.now() - ray.createdAt < 500);
    }
    
    renderParticles() {
        for (const particle of this.particles) {
            // 更新粒子位置
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= particle.decay;
            
            // 绘制粒子
            this.ctx.fillStyle = `rgba(${particle.color}, ${particle.life})`;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // 移除死亡的粒子
        this.particles = this.particles.filter(particle => particle.life > 0);
    }
    
    renderUI() {
        // 在屏幕空间绘制UI
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // 绘制准星
        if (this.state === GameState.PLAYING && this.player && this.player.alive) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 1;
            
            // 水平线
            this.ctx.beginPath();
            this.ctx.moveTo(this.mouse.x - 10, this.mouse.y);
            this.ctx.lineTo(this.mouse.x + 10, this.mouse.y);
            this.ctx.stroke();
            
            // 垂直线
            this.ctx.beginPath();
            this.ctx.moveTo(this.mouse.x, this.mouse.y - 10);
            this.ctx.lineTo(this.mouse.x, this.mouse.y + 10);
            this.ctx.stroke();
        }
    }
    
    createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            
            // 转换颜色
            let r, g, b;
            if (color === '#ff4444') {
                r = 255; g = 68; b = 68;
            } else if (color === '#4488ff') {
                r = 68; g = 136; b = 255;
            } else if (color === '#aa44ff') {
                r = 170; g = 68; b = 255;
            } else {
                r = 255; g = 255; b = 255;
            }
            
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 3 + 1,
                color: `${r}, ${g}, ${b}`,
                life: 1,
                decay: 0.02
            });
        }
    }
    
    createExplosion(x, y) {
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 5 + 2,
                color: '255, 68, 68',
                life: 1,
                decay: 0.03
            });
        }
    }
    
    createBigExplosion(x, y) {
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 3;
            
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 8 + 3,
                color: '170, 68, 255',
                life: 1,
                decay: 0.02
            });
        }
        
        // 屏幕震动效果
        this.shakeScreen(500);
    }
    
    createBossLaserWarning(x, y) {
        // 创建BOSS激光警告效果
        // 这里可以添加一些视觉效果，比如地面标记等
    }
    
    createBossLaser(x, y) {
        // 创建BOSS激光效果
        // BOSS向六个方向发射激光
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 / 6) * i;
            const endX = x + Math.cos(angle) * 1000;
            const endY = y + Math.sin(angle) * 1000;
            
            this.rays.push({
                x,
                y,
                endX,
                endY,
                width: 20,
                color: '255, 100, 100',
                createdAt: Date.now()
            });
        }
    }
    
    shakeScreen(duration) {
        // 简单的屏幕震动效果
        const startTime = Date.now();
        const originalTransform = this.canvas.style.transform;
        
        const shake = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < duration) {
                const intensity = 1 - elapsed / duration;
                const x = (Math.random() - 0.5) * 10 * intensity;
                const y = (Math.random() - 0.5) * 10 * intensity;
                this.canvas.style.transform = `translate(${x}px, ${y}px)`;
                requestAnimationFrame(shake);
            } else {
                this.canvas.style.transform = originalTransform;
            }
        };
        
        shake();
    }
    
    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 初始化游戏
const game = new Game();