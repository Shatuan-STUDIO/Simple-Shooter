# Simple Shooter - 多人无尽射击游戏

一个基于Node.js和HTML5的多人无尽射击游戏，支持PC和移动端。

## 功能特点

- 多人在线对战
- 无尽地图探索
- NPC和BOSS战斗
- 实时的玩家列表
- 服务器管理命令
- 响应式设计，支持PC和移动端
- 炫酷的粒子特效和光影效果

## 快速开始

### 服务器端

1. 确保已安装Node.js (推荐版本 22.14.0 或更高)
2. 在项目根目录运行以下命令安装依赖：

```bash
npm install
```

3. 启动服务器：

```bash
npm start
```

或者使用开发模式（需要安装nodemon）：

```bash
npm run dev
```

4. 服务器启动后，会在终端显示命令提示符，可以输入以下命令管理游戏：

```
/list : 列出所有玩家名称和玩家所属IP地址
/clear : 清除所有NPC和BOSS
/clearnpcs : 清除所有NPC
/kick all : 踢出所有玩家
/kick [玩家名称] : 踢出该玩家
/find [玩家名称] : 查找该玩家是否在线（不区分大小写，雷同度高也列在查找名单内）
/check [玩家名称] : 查询该玩家的基本信息
/ban <封禁时长（天）> [玩家名称] : 临时封禁该玩家
/ban forever [玩家名称] : 永久封禁该玩家
/banip <封禁时长（天）> [玩家名称] : 临时封禁该玩家
/banip forever [玩家名称] : 永久封禁该玩家
/create [npc/boss] <生成个数> : 生成若干自动程序控制的NPC或BOSS（BOSS最多只能在场两个）
/kill [玩家名称] : 立刻击杀该玩家
/kill all : 立即击杀在场的所有玩家
/shutdown : 向客户端发送停服讯息，并立即关闭服务端程序
/help : 显示帮助信息
```

### 客户端

1. 打开浏览器，访问服务器地址（例如：http://localhost:25596）
2. 输入用户名（只能包含字母、数字和下划线，长度不超过16个字符）
3. 点击连接按钮加入游戏

## 游戏操作

### PC端

- **W A S D**: 移动
- **鼠标指针**: 瞄准方向
- **鼠标左键**: 发射子弹（按住连发）
- **鼠标右键**: 蓄力发射激光（最多7秒，7秒后自动发射）

### 移动端

- **虚拟方向键**: 移动
- **FIRE按钮**: 发射子弹（按住连发）
- **长按FIRE按钮**: 蓄力发射激光

## 游戏规则

- 玩家需要在无尽地图中清除尽可能多的NPC以获取点数
- 击败NPC获得10分，击败BOSS获得100分，击败其他玩家获得50分
- 玩家被NPC撞击会扣除生命值
- 玩家死亡后需要刷新页面以重新开始
- 挂机超过设定时间会被自动踢出服务器

## 配置文件

服务器配置文件为`server.conf`，包含以下可配置项：

```
port = 25596                    # 服务器端口
max_player = 20                 # 最大玩家数
invincible_after_join = 3       # 出生无敌时间（秒）
player_hp = 100                 # 玩家血量
npc_hp = 80                     # NPC血量
boss_hp = 3000                  # BOSS血量
bullet_speed = 25               # 子弹速度
bullet_damage = 3               # 子弹基础伤害
player_ray_damage = 10          # 玩家激光基础伤害
disconnect_kick = 40            # 挂机踢出时间（分钟）
pvp = true                      # 玩家是否可以互相攻击造成伤害
initial_npc_count = 100         # 初始NPC数量
npc_spawn_interval = 30000       # NPC生成间隔（毫秒）
npc_spawn_count = 50            # 每次生成的NPC数量
npc_speed = 2                   # NPC移动速度
npc_damage = 10                 # NPC对玩家造成的伤害
npc_invincible_time = 1         # 玩家被NPC撞击后的无敌时间（秒）
max_npc_count = 1000           # 最大NPC数量
boss_attack_interval = 30000    # BOSS攻击间隔（毫秒）
max_boss_count = 2              # 最大BOSS数量
laser_charge_max_time = 7000    # 激光最大蓄力时间（毫秒）
laser_cooldown_time = 14000     # 激光冷却时间（毫秒）
player_move_speed = 5           # 玩家移动速度
bullet_fire_rate = 200          # 子弹发射间隔（毫秒）
ray_damage_multiplier = 5       # 激光伤害倍数
```

## 技术栈

- **服务器端**: Node.js, Express, Socket.IO
- **客户端**: HTML5, CSS3, JavaScript (ES6+)
- **通信**: WebSocket (Socket.IO)

## 项目结构

```
Simple-Shooter/
├── server/
│   └── index.js              # 服务器端主文件
├── client/
│   ├── index.html            # 客户端主页面
│   ├── css/
│   │   └── style.css         # 样式文件
│   └── js/
│       └── game.js           # 游戏逻辑
├── server.conf               # 服务器配置文件
├── name.txt                  # 已使用用户名记录
├── package.json              # 项目依赖
└── README.md                 # 项目说明
```

## 许可证

GNU General Public License v3.0

## 贡献


欢迎提交Issue和Pull Request来改进这个项目。
