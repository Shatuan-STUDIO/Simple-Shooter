const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 配置文件读取
const config = {};
const configPath = path.join(__dirname, '../server.conf');

// 读取配置文件
function loadConfig() {
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    configData.split('\n').forEach(line => {
      if (line.trim() && !line.startsWith('//')) {
        const [key, value] = line.split('=').map(s => s.trim());
        if (key && value) {
          // 尝试转换为数字
          const numValue = Number(value);
          config[key] = isNaN(numValue) ? value : numValue;
        }
      }
    });
  } catch (error) {
    console.error('配置文件读取失败:', error.message);
    process.exit(1);
  }
}

// 初始化配置
loadConfig();

// 游戏状态
const gameState = {
  players: {},
  npcs: {},
  bosses: {},
  bullets: [], // 添加子弹数组
  rays: [], // 添加激光数组
  bannedIPs: {},
  bannedUsers: {},
  playerCount: 0
};

// 已使用的用户名
const usedUsernames = new Set();

// 读取已保存的用户名
function loadUsernames() {
  try {
    if (fs.existsSync(path.join(__dirname, '../name.txt'))) {
      const usernames = fs.readFileSync(path.join(__dirname, '../name.txt'), 'utf8').split('\n');
      usernames.forEach(username => {
        if (username.trim()) {
          usedUsernames.add(username.trim());
        }
      });
    }
  } catch (error) {
    console.error('用户名文件读取失败:', error.message);
  }
}

// 保存用户名
function saveUsername(username) {
  try {
    fs.appendFileSync(path.join(__dirname, '../name.txt'), username + '\n');
  } catch (error) {
    console.error('用户名保存失败:', error.message);
  }
}

// 日志记录
function log(message) {
  const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // 写入日志文件
  try {
    fs.appendFileSync(path.join(__dirname, '../server.log'), logMessage + '\n');
  } catch (error) {
    console.error('日志写入失败:', error.message);
  }
}

// 生成随机ID
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// 生成NPC
function generateNPC() {
  const id = generateId();
  const mapSize = 2000;
  gameState.npcs[id] = {
    id,
    x: Math.random() * mapSize - mapSize/2,
    y: Math.random() * mapSize - mapSize/2,
    hp: config.npc_hp,
    maxHp: config.npc_hp,
    speed: config.npc_speed || 2
  };
  return id;
}

// 生成BOSS
function generateBoss() {
  const bossCount = Object.keys(gameState.bosses).length;
  if (bossCount >= (config.max_boss_count || 2)) return null;
  
  const id = generateId();
  const mapSize = 2000;
  gameState.bosses[id] = {
    id,
    x: Math.random() * mapSize - mapSize/2,
    y: Math.random() * mapSize - mapSize/2,
    hp: config.boss_hp,
    maxHp: config.boss_hp,
    lastAttack: Date.now(),
    nextLaserTime: Date.now() + (config.boss_attack_interval || 30000)
  };
  return id;
}

// 初始化NPC
function initializeNPCs() {
  const count = config.initial_npc_count || 100;
  for (let i = 0; i < count; i++) {
    generateNPC();
  }
  log(`已生成 ${count} 个NPC`);
}

// 定期生成NPC
setInterval(() => {
  // 检查当前NPC数量是否超过最大限制
  const currentNPCCount = Object.keys(gameState.npcs).length;
  const maxNPCCount = config.max_npc_count || 1000;
  
  if (currentNPCCount >= maxNPCCount) {
    // 如果超过最大限制，清除所有NPC
    const npcCount = Object.keys(gameState.npcs).length;
    gameState.npcs = {};
    io.emit('clear_npcs_bosses');
    log(`NPC数量达到上限 ${maxNPCCount}，已清除所有NPC (${npcCount}个)`);
    return;
  }
  
  // 否则正常生成NPC
  const count = config.npc_spawn_count || 50;
  for (let i = 0; i < count; i++) {
    generateNPC();
  }
  log(`已生成 ${count} 个新NPC，当前总数: ${Object.keys(gameState.npcs).length}`);
}, config.npc_spawn_interval || 30000);

// 处理玩家移动
function updateNPCs() {
  Object.values(gameState.npcs).forEach(npc => {
    // 为每个NPC初始化或更新移动状态
    if (!npc.moveState) {
      npc.moveState = {
        direction: Math.random() * Math.PI * 2,
        changeDirectionTime: Date.now() + (Math.random() * 3000 + 2000), // 2-5秒后改变方向
        speed: (Math.random() * 0.5 + 0.5) * (config.npc_speed || 2) // 速度在0.5-1.5倍之间变化
      };
    }
    
    const now = Date.now();
    
    // 检查是否需要改变方向
    if (now >= npc.moveState.changeDirectionTime) {
      npc.moveState.direction = Math.random() * Math.PI * 2;
      npc.moveState.changeDirectionTime = now + (Math.random() * 3000 + 2000);
      npc.moveState.speed = (Math.random() * 0.5 + 0.5) * (config.npc_speed || 2);
    }
    
    // 计算新位置
    const newX = npc.x + Math.cos(npc.moveState.direction) * npc.moveState.speed;
    const newY = npc.y + Math.sin(npc.moveState.direction) * npc.moveState.speed;
    
    // 限制在地图范围内
    const mapSize = 1000;
    if (newX >= -mapSize && newX <= mapSize && newY >= -mapSize && newY <= mapSize) {
      npc.x = newX;
      npc.y = newY;
    } else {
      // 如果碰到边界，立即改变方向
      npc.moveState.direction = Math.random() * Math.PI * 2;
      npc.moveState.changeDirectionTime = now + (Math.random() * 3000 + 2000);
    }
    
    // 如果有玩家在附近，有概率朝玩家方向移动（但不直接跟随）
    for (const player of Object.values(gameState.players)) {
      if (!player.alive) continue;
      
      const distance = Math.sqrt(Math.pow(npc.x - player.x, 2) + Math.pow(npc.y - player.y, 2));
      
      // 如果玩家在100像素范围内，有30%概率朝玩家方向移动
      if (distance < 100 && Math.random() < 0.3) {
        const angleToPlayer = Math.atan2(player.y - npc.y, player.x - npc.x);
        // 不直接朝向玩家，而是稍微偏移
        npc.moveState.direction = angleToPlayer + (Math.random() - 0.5) * 0.5;
        npc.moveState.changeDirectionTime = now + (Math.random() * 2000 + 1000); // 1-3秒后再次改变方向
      }
    }
  });
  
  // 广播NPC位置
  io.emit('npcs_update', gameState.npcs);
}

// 更新BOSS
function updateBosses() {
  const now = Date.now();
  Object.values(gameState.bosses).forEach(boss => {
    // BOSS移动逻辑
    if (!boss.lastMoveTime) {
      boss.lastMoveTime = now;
      boss.moveDirection = Math.random() * Math.PI * 2;
    }
    
    // 每秒改变一次移动方向
    if (now - boss.lastMoveTime > 1000) {
      boss.lastMoveTime = now;
      boss.moveDirection = Math.random() * Math.PI * 2;
    }
    
    // 移动BOSS
    const bossSpeed = 1; // BOSS移动速度
    boss.x += Math.cos(boss.moveDirection) * bossSpeed;
    boss.y += Math.sin(boss.moveDirection) * bossSpeed;
    
    // 限制BOSS在地图范围内
    const mapSize = 1000;
    boss.x = Math.max(-mapSize, Math.min(mapSize, boss.x));
    boss.y = Math.max(-mapSize, Math.min(mapSize, boss.y));
    
    // 检查是否需要发射激光
    if (now >= boss.nextLaserTime) {
      boss.nextLaserTime = now + (config.boss_attack_interval || 30000);
      io.emit('boss_laser_warning', { id: boss.id, x: boss.x, y: boss.y });
      
      // 3秒后发射激光
      setTimeout(() => {
        io.emit('boss_laser_fire', { id: boss.id, x: boss.x, y: boss.y });
      }, 3000);
    }
  });
}

// 游戏循环
setInterval(() => {
  updateNPCs();
  updateBosses();
  
  // 广播BOSS位置更新
  io.emit('bosses_update', gameState.bosses);
}, 50);

// 处理碰撞检测
function checkCollisions() {
  // NPC与玩家碰撞
  Object.values(gameState.npcs).forEach(npc => {
    Object.values(gameState.players).forEach(player => {
      if (player.invincible || !player.alive) return; // 添加!player.alive检查
      
      const distance = Math.sqrt(Math.pow(npc.x - player.x, 2) + Math.pow(npc.y - player.y, 2));
      if (distance < 30) { // 碰撞半径
        player.hp -= config.npc_damage || 10;
        player.invincible = true;
        
        // 通知所有玩家该玩家进入无敌状态
        io.emit('player_invincibility_started', { playerId: player.id });
        
        setTimeout(() => {
          if (gameState.players[player.id]) {
            gameState.players[player.id].invincible = false;
            // 通知所有玩家该玩家无敌时间已结束
            io.emit('player_invincibility_ended', { playerId: player.id });
          }
        }, (config.npc_invincible_time || 1) * 1000);
        
        if (player.hp <= 0) {
          playerDeath(player.id);
        } else {
          io.emit('player_hit', { playerId: player.id, damage: config.npc_damage || 10, currentHp: player.hp });
        }
      }
    });
  });
}

// 玩家死亡
function playerDeath(playerId) {
  const player = gameState.players[playerId];
  if (!player) return;
  
  player.deathTime = Date.now();
  player.alive = false;
  
  // 通知所有玩家该玩家已死亡
  io.emit('player_death', { playerId, death_time: config.death_time || 10 });
  log(`玩家 ${player.username} 已死亡`);
}

// 玩家复活
function playerRevive(playerId) {
  const player = gameState.players[playerId];
  if (!player) return;
  
  player.hp = config.player_hp || 100;
  player.alive = true;
  player.invincible = true;
  player.x = 0;
  player.y = 0;
  
  // 通知所有玩家该玩家已复活
  io.emit('player_revived', { 
    playerId, 
    invincible: true,
    hp: player.hp,
    maxHp: player.maxHp || (config.player_hp || 100),
    x: player.x,
    y: player.y
  });
  
  setTimeout(() => {
    if (gameState.players[playerId]) {
      gameState.players[playerId].invincible = false;
      // 通知所有玩家该玩家无敌时间已结束
      io.emit('player_invincibility_ended', { playerId });
    }
  }, (config.invincible_after_join || 3) * 1000);
  
  io.to(playerId).emit('player_revive');
  log(`玩家 ${player.username} 已复活`);
}

// 定期检查碰撞
setInterval(checkCollisions, 100);

// 处理子弹碰撞
function handleBulletHit(bullet, target) {
  if (gameState.npcs[target.id]) {
    gameState.npcs[target.id].hp -= bullet.damage;
    
    if (gameState.npcs[target.id].hp <= 0) {
      delete gameState.npcs[target.id];
      gameState.players[bullet.ownerId].score += 10;
      io.emit('score_updated', { playerId: bullet.ownerId, score: gameState.players[bullet.ownerId].score });
      io.emit('npc_destroyed', { id: target.id });
      log(`玩家 ${gameState.players[bullet.ownerId].username} 击败了NPC`);
    }
    
    io.emit('npc_hit', { id: target.id, damage: bullet.damage });
    return true;
  }
  
  if (gameState.bosses[target.id]) {
    gameState.bosses[target.id].hp -= bullet.damage;
    
    if (gameState.bosses[target.id].hp <= 0) {
      delete gameState.bosses[target.id];
      gameState.players[bullet.ownerId].score += 100;
      io.emit('score_updated', { playerId: bullet.ownerId, score: gameState.players[bullet.ownerId].score });
      io.emit('boss_destroyed', { id: target.id });
      log(`玩家 ${gameState.players[bullet.ownerId].username} 击败了BOSS`);
    }
    
    io.emit('boss_hit', { id: target.id, damage: bullet.damage });
    return true;
  }
  
  if (config.pvp && gameState.players[target.id]) {
    const targetPlayer = gameState.players[target.id];
    if (targetPlayer.invincible || !targetPlayer.alive) return false;
    
    targetPlayer.hp -= bullet.damage;
    
    if (targetPlayer.hp <= 0) {
      playerDeath(target.id);
      gameState.players[bullet.ownerId].score += 50;
      io.emit('score_updated', { playerId: bullet.ownerId, score: gameState.players[bullet.ownerId].score });
      log(`玩家 ${gameState.players[bullet.ownerId].username} 击败了玩家 ${targetPlayer.username}`);
    }
    
    io.emit('player_hit', { playerId: target.id, damage: bullet.damage, currentHp: targetPlayer.hp });
    return true;
  }
  
  return false;
}

// 处理激光碰撞
function handleRayHit(ray, target) {
  if (gameState.npcs[target.id]) {
    gameState.npcs[target.id].hp -= ray.damage;
    
    if (gameState.npcs[target.id].hp <= 0) {
      delete gameState.npcs[target.id];
      gameState.players[ray.ownerId].score += 10;
      io.emit('score_updated', { playerId: ray.ownerId, score: gameState.players[ray.ownerId].score });
      io.emit('npc_destroyed', { id: target.id });
      log(`玩家 ${gameState.players[ray.ownerId].username} 用激光击败了NPC`);
    }
    
    io.emit('npc_hit', { id: target.id, damage: ray.damage });
    return true;
  }
  
  if (gameState.bosses[target.id]) {
    gameState.bosses[target.id].hp -= ray.damage;
    
    if (gameState.bosses[target.id].hp <= 0) {
      delete gameState.bosses[target.id];
      gameState.players[ray.ownerId].score += 100;
      io.emit('score_updated', { playerId: ray.ownerId, score: gameState.players[ray.ownerId].score });
      io.emit('boss_destroyed', { id: target.id });
      log(`玩家 ${gameState.players[ray.ownerId].username} 用激光击败了BOSS`);
    }
    
    io.emit('boss_hit', { id: target.id, damage: ray.damage });
    return true;
  }
  
  if (config.pvp && gameState.players[target.id]) {
    const targetPlayer = gameState.players[target.id];
    if (targetPlayer.invincible || !targetPlayer.alive) return false;
    
    targetPlayer.hp -= ray.damage;
    
    if (targetPlayer.hp <= 0) {
      playerDeath(target.id);
      gameState.players[ray.ownerId].score += 50;
      io.emit('score_updated', { playerId: ray.ownerId, score: gameState.players[ray.ownerId].score });
      log(`玩家 ${gameState.players[ray.ownerId].username} 用激光击败了玩家 ${targetPlayer.username}`);
    }
    
    io.emit('player_hit', { playerId: target.id, damage: ray.damage, currentHp: targetPlayer.hp });
    return true;
  }
  
  return false;
}

// Socket.IO 连接处理
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  log(`新连接来自: ${clientIP}`);
  
  // 检查IP是否被封禁
  if (gameState.bannedIPs[clientIP]) {
    const banInfo = gameState.bannedIPs[clientIP];
    if (banInfo.expires === 0 || Date.now() < banInfo.expires) {
      socket.emit('banned', { reason: banInfo.reason, expires: banInfo.expires });
      socket.disconnect();
      return;
    } else {
      // 封禁已过期
      delete gameState.bannedIPs[clientIP];
    }
  }
  
  // 处理玩家加入
  socket.on('join_game', (data) => {
    const { username } = data;
    
    // 验证用户名
    if (!username || username.length > 16 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      socket.emit('join_error', { message: '用户名无效' });
      return;
    }
    
    // 检查用户名是否已被使用
    if (usedUsernames.has(username)) {
      socket.emit('join_error', { message: '用户名已被使用' });
      return;
    }
    
    // 检查用户是否被封禁
    if (gameState.bannedUsers[username]) {
      const banInfo = gameState.bannedUsers[username];
      if (banInfo.expires === 0 || Date.now() < banInfo.expires) {
        socket.emit('banned', { reason: banInfo.reason, expires: banInfo.expires });
        return;
      } else {
        // 封禁已过期
        delete gameState.bannedUsers[username];
      }
    }
    
    // 检查服务器是否已满
    if (gameState.playerCount >= config.max_player) {
      socket.emit('join_error', { message: '服务器已满' });
      return;
    }
    
    // 创建玩家
    const playerId = generateId();
    gameState.players[playerId] = {
      id: playerId,
      username,
      ip: clientIP,
      x: 0,
      y: 0,
      hp: config.player_hp || 100,
      maxHp: config.player_hp || 100,
      score: 0,
      kills: 0,
      bossKills: 0,
      playerKills: 0,
      alive: true,
      invincible: true,
      lastActive: Date.now(),
      level: 1,
      socketId: socket.id
    };
    
    // 保存用户名
    usedUsernames.add(username);
    saveUsername(username);
    
    // 更新玩家数量
    gameState.playerCount++;
    
    // 发送加入成功消息
    socket.emit('join_success', {
      playerId,
      player: gameState.players[playerId],
      config: {
        player_move_speed: config.player_move_speed || 5,
        bullet_speed: config.bullet_speed || 25,
        bullet_damage: config.bullet_damage || 3,
        player_ray_damage: config.player_ray_damage || 10,
        laser_charge_max_time: config.laser_charge_max_time || 7000,
        laser_cooldown_time: config.laser_cooldown_time || 14000,
        bullet_fire_rate: config.bullet_fire_rate || 200,
        ray_damage_multiplier: config.ray_damage_multiplier || 5
      }
    });
    
    // 发送当前游戏状态
    socket.emit('game_state', {
      players: gameState.players,
      npcs: gameState.npcs,
      bosses: gameState.bosses
    });
    
    // 广播新玩家加入
    socket.broadcast.emit('player_joined', { player: gameState.players[playerId] });
    log(`玩家 ${username} (${clientIP}) 已加入游戏`);
    
    // 设置无敌时间
    setTimeout(() => {
      if (gameState.players[playerId]) {
        gameState.players[playerId].invincible = false;
        // 通知所有玩家该玩家无敌时间已结束
        io.emit('player_invincibility_ended', { playerId });
      }
    }, (config.invincible_after_join || 3) * 1000);
  });
  
  // 处理玩家移动
  socket.on('player_move', (data) => {
    const player = gameState.players[data.playerId];
    if (!player || !player.alive) return;
    
    player.x = data.x;
    player.y = data.y;
    player.lastActive = Date.now();
    
    // 广播玩家位置
    socket.broadcast.emit('player_moved', { playerId: data.playerId, x: data.x, y: data.y });
  });
  
  // 处理玩家射击
  socket.on('player_shoot', (data) => {
    const player = gameState.players[data.playerId];
    if (!player || !player.alive) return;
    
    const bulletData = {
      bulletId: generateId(),
      ownerId: data.playerId,
      x: data.x,
      y: data.y,
      angle: data.angle,
      damage: config.bullet_damage || 3,
      speed: config.bullet_speed || 25
    };
    
    // 将子弹添加到游戏状态
    gameState.bullets.push(bulletData);
    
    // 广播给所有玩家（包括发射者）
    io.emit('bullet_fired', bulletData);
  });
  
  // 处理玩家激光
  socket.on('player_ray', (data) => {
    const player = gameState.players[data.playerId];
    if (!player || !player.alive) return;
    
    // 计算激光伤害
    const chargeTime = data.chargeTime;
    const maxChargeTime = config.laser_charge_max_time || 7000;
    const damageMultiplier = config.ray_damage_multiplier || 5;
    const baseDamage = config.player_ray_damage || 10;
    const damage = baseDamage + (chargeTime / maxChargeTime) * baseDamage * damageMultiplier;
    
    const rayData = {
      rayId: generateId(),
      ownerId: data.playerId,
      x: data.x,
      y: data.y,
      angle: data.angle,
      damage: damage,
      width: 10 + (chargeTime / maxChargeTime) * 40,
      createdAt: Date.now() // 添加创建时间
    };
    
    // 广播给所有玩家（包括发射者）
    io.emit('ray_fired', rayData);
    
    // 将激光添加到游戏状态
    gameState.rays.push(rayData);
    
    // 检查激光碰撞
    const rayEndX = data.x + Math.cos(data.angle) * 1000;
    const rayEndY = data.y + Math.sin(data.angle) * 1000;
    
    // 检查所有可能的碰撞
    [...Object.values(gameState.npcs), ...Object.values(gameState.bosses)].forEach(target => {
      // 简化的射线-矩形碰撞检测
      const distance = pointToLineDistance(
        target.x, target.y,
        data.x, data.y,
        rayEndX, rayEndY
      );
      
      if (distance < 30) { // 碰撞半径
        handleRayHit({ ownerId: data.playerId, damage }, target);
      }
    });
    
    if (config.pvp) {
      Object.values(gameState.players).forEach(target => {
        if (target.id === data.playerId) return;
        
        const distance = pointToLineDistance(
          target.x, target.y,
          data.x, data.y,
          rayEndX, rayEndY
        );
        
        if (distance < 30) { // 碰撞半径
          handleRayHit({ ownerId: data.playerId, damage }, target);
        }
      });
    }
  });
  
  // 处理断开连接
  socket.on('disconnect', () => {
    // 找到断开连接的玩家
    let disconnectedPlayer = null;
    let disconnectedPlayerId = null;
    
    for (const [id, player] of Object.entries(gameState.players)) {
      if (player.socketId === socket.id) {
        disconnectedPlayer = player;
        disconnectedPlayerId = id;
        break;
      }
    }
    
    if (disconnectedPlayer) {
      // 释放用户名
      usedUsernames.delete(disconnectedPlayer.username);
      
      // 删除玩家
      delete gameState.players[disconnectedPlayerId];
      gameState.playerCount--;
      
      // 广播玩家离开
      socket.broadcast.emit('player_left', { playerId: disconnectedPlayerId });
      log(`玩家 ${disconnectedPlayer.username} (${disconnectedPlayer.ip}) 已离开游戏`);
    }
  });
});

// 计算点到线段的距离
function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  
  let xx, yy;
  
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = px - xx;
  const dy = py - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
}

// 处理子弹碰撞
setInterval(() => {
  // 遍历所有子弹
  for (let i = 0; i < gameState.bullets.length; i++) {
    const bullet = gameState.bullets[i];
    
    // 检查子弹是否存在
    if (!bullet || bullet.x === undefined || bullet.y === undefined) {
      gameState.bullets.splice(i, 1);
      i--;
      continue;
    }
    
    // 检查子弹是否超出范围
    const distance = Math.sqrt(Math.pow(bullet.x - 0, 2) + Math.pow(bullet.y - 0, 2));
    if (distance > 2000) {
      gameState.bullets.splice(i, 1);
      i--;
      continue;
    }
    
    // 更新子弹位置
    bullet.x += Math.cos(bullet.angle) * bullet.speed;
    bullet.y += Math.sin(bullet.angle) * bullet.speed;
    
    // 检查与NPC的碰撞
    for (const [npcId, npc] of Object.entries(gameState.npcs)) {
      const distance = Math.sqrt(Math.pow(bullet.x - npc.x, 2) + Math.pow(bullet.y - npc.y, 2));
      if (distance < 30) { // 碰撞半径
        if (handleBulletHit(bullet, npc)) {
          gameState.bullets.splice(i, 1);
          i--;
          break;
        }
      }
    }
    
    // 检查与BOSS的碰撞
    for (const [bossId, boss] of Object.entries(gameState.bosses)) {
      const distance = Math.sqrt(Math.pow(bullet.x - boss.x, 2) + Math.pow(bullet.y - boss.y, 2));
      if (distance < 40) { // 碰撞半径
        if (handleBulletHit(bullet, boss)) {
          gameState.bullets.splice(i, 1);
          i--;
          break;
        }
      }
    }
    
    // 检查与玩家的碰撞（如果PVP开启）
    if (config.pvp) {
      for (const [playerId, player] of Object.entries(gameState.players)) {
        if (playerId === bullet.ownerId) continue; // 不击中自己
        
        const distance = Math.sqrt(Math.pow(bullet.x - player.x, 2) + Math.pow(bullet.y - player.y, 2));
        if (distance < 25) { // 碰撞半径
          if (handleBulletHit(bullet, player)) {
            gameState.bullets.splice(i, 1);
            i--;
            break;
          }
        }
      }
    }
  }
}, 50);

// 清理激光
setInterval(() => {
  // 移除超过500ms的激光
  const now = Date.now();
  gameState.rays = gameState.rays.filter(ray => {
    return (now - ray.createdAt) < 500;
  });
}, 100);

// 检查挂机玩家
setInterval(() => {
  const now = Date.now();
  const kickTime = (config.disconnect_kick || 40) * 60 * 1000; // 转换为毫秒
  
  for (const [id, player] of Object.entries(gameState.players)) {
    if (now - player.lastActive > kickTime) {
      // 踢出挂机玩家
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('kicked', { reason: '挂机时间过长' });
        socket.disconnect();
      }
      
      // 释放用户名
      usedUsernames.delete(player.username);
      
      // 删除玩家
      delete gameState.players[id];
      gameState.playerCount--;
      
      // 广播玩家离开
      io.emit('player_left', { playerId: id });
      log(`玩家 ${player.username} (${player.ip}) 因挂机被踢出`);
    }
  }
}, 60000); // 每分钟检查一次

// 服务器命令处理
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function processCommand(input) {
  const parts = input.trim().split(' ');
  const command = parts[0].toLowerCase();
  
  switch (command) {
    case '/list':
      console.log('在线玩家列表:');
      for (const player of Object.values(gameState.players)) {
        console.log(`- ${player.username} (${player.ip})`);
      }
      break;
      
    case '/clear':
      const npcCount = Object.keys(gameState.npcs).length;
      const bossCount = Object.keys(gameState.bosses).length;
      gameState.npcs = {};
      gameState.bosses = {};
      io.emit('clear_npcs_bosses');
      log(`已清除所有NPC (${npcCount}个) 和BOSS (${bossCount}个)`);
      break;
      
    case '/clearnpcs':
      const npcCount2 = Object.keys(gameState.npcs).length;
      gameState.npcs = {};
      io.emit('npcs_update', gameState.npcs);
      log(`已清除所有NPC (${npcCount2}个)`);
      break;
      
    case '/kick':
      if (parts[1] === 'all') {
        for (const [id, player] of Object.entries(gameState.players)) {
          const socket = io.sockets.sockets.get(player.socketId);
          if (socket) {
            socket.emit('kicked', { reason: '管理员踢出' });
            socket.disconnect();
          }
          usedUsernames.delete(player.username);
        }
        const kickedCount = gameState.playerCount;
        gameState.players = {};
        gameState.playerCount = 0;
        log(`已踢出所有玩家 (${kickedCount}个)`);
      } else {
        const username = parts.slice(1).join(' ');
        let found = false;
        
        for (const [id, player] of Object.entries(gameState.players)) {
          if (player.username.toLowerCase() === username.toLowerCase()) {
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('kicked', { reason: '管理员踢出' });
              socket.disconnect();
            }
            usedUsernames.delete(player.username);
            delete gameState.players[id];
            gameState.playerCount--;
            log(`已踢出玩家: ${player.username} (${player.ip})`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.log(`未找到玩家: ${username}`);
        }
      }
      break;
      
    case '/find':
      const searchName = parts.slice(1).join(' ').toLowerCase();
      if (!searchName) {
        console.log('请提供要查找的玩家名称');
        return;
      }
      
      const matches = [];
      for (const player of Object.values(gameState.players)) {
        if (player.username.toLowerCase().includes(searchName)) {
          matches.push(player);
        }
      }
      
      if (matches.length === 0) {
        console.log(`未找到包含 "${searchName}" 的玩家`);
      } else {
        console.log(`找到 ${matches.length} 个匹配的玩家:`);
        matches.forEach(player => {
          console.log(`- ${player.username} (${player.ip})`);
        });
      }
      break;
      
    case '/check':
      const checkName = parts.slice(1).join(' ');
      if (!checkName) {
        console.log('请提供要查询的玩家名称');
        return;
      }
      
      let foundPlayer = null;
      for (const player of Object.values(gameState.players)) {
        if (player.username.toLowerCase() === checkName.toLowerCase()) {
          foundPlayer = player;
          break;
        }
      }
      
      if (!foundPlayer) {
        console.log(`未找到玩家: ${checkName}`);
      } else {
        console.log(`玩家信息:`);
        console.log(`- 用户名: ${foundPlayer.username}`);
        console.log(`- IP地址: ${foundPlayer.ip}`);
        console.log(`- 等级: ${foundPlayer.level}`);
        console.log(`- 积分: ${foundPlayer.score}`);
        console.log(`- 击杀NPC数: ${foundPlayer.kills}`);
        console.log(`- 击杀BOSS数: ${foundPlayer.bossKills}`);
        console.log(`- 击杀玩家数: ${foundPlayer.playerKills}`);
        console.log(`- 当前血量: ${foundPlayer.hp}/${foundPlayer.maxHp}`);
        console.log(`- 状态: ${foundPlayer.alive ? '存活' : '死亡'}`);
      }
      break;
      
    case '/ban':
      if (parts.length < 3) {
        console.log('用法: /ban <封禁时长(天)> [玩家名称] 或 /ban forever [玩家名称]');
        return;
      }
      
      const banDuration = parts[1];
      const banUsername = parts.slice(2).join(' ');
      
      if (banDuration === 'forever') {
        // 永久封禁
        for (const [id, player] of Object.entries(gameState.players)) {
          if (player.username.toLowerCase() === banUsername.toLowerCase()) {
            gameState.bannedUsers[player.username] = {
              reason: '管理员封禁',
              expires: 0 // 0表示永久
            };
            
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('banned', { reason: '管理员永久封禁', expires: 0 });
              socket.disconnect();
            }
            
            usedUsernames.delete(player.username);
            delete gameState.players[id];
            gameState.playerCount--;
            log(`已永久封禁玩家: ${player.username} (${player.ip})`);
            return;
          }
        }
        
        console.log(`未找到玩家: ${banUsername}`);
      } else {
        const days = parseInt(banDuration);
        if (isNaN(days)) {
          console.log('封禁时长必须是数字或 "forever"');
          return;
        }
        
        // 临时封禁
        for (const [id, player] of Object.entries(gameState.players)) {
          if (player.username.toLowerCase() === banUsername.toLowerCase()) {
            const expires = Date.now() + days * 24 * 60 * 60 * 1000;
            gameState.bannedUsers[player.username] = {
              reason: '管理员封禁',
              expires
            };
            
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('banned', { reason: `管理员封禁 ${days} 天`, expires });
              socket.disconnect();
            }
            
            usedUsernames.delete(player.username);
            delete gameState.players[id];
            gameState.playerCount--;
            log(`已封禁玩家 ${player.username} (${player.ip}) ${days} 天`);
            return;
          }
        }
        
        console.log(`未找到玩家: ${banUsername}`);
      }
      break;
      
    case '/banip':
      if (parts.length < 3) {
        console.log('用法: /banip <封禁时长(天)> [玩家名称] 或 /banip forever [玩家名称]');
        return;
      }
      
      const banIPDuration = parts[1];
      const banIPUsername = parts.slice(2).join(' ');
      
      if (banIPDuration === 'forever') {
        // 永久IP封禁
        for (const [id, player] of Object.entries(gameState.players)) {
          if (player.username.toLowerCase() === banIPUsername.toLowerCase()) {
            gameState.bannedIPs[player.ip] = {
              reason: '管理员IP封禁',
              expires: 0 // 0表示永久
            };
            
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('banned', { reason: '管理员永久IP封禁', expires: 0 });
              socket.disconnect();
            }
            
            usedUsernames.delete(player.username);
            delete gameState.players[id];
            gameState.playerCount--;
            log(`已永久IP封禁玩家: ${player.username} (${player.ip})`);
            return;
          }
        }
        
        console.log(`未找到玩家: ${banIPUsername}`);
      } else {
        const days = parseInt(banIPDuration);
        if (isNaN(days)) {
          console.log('封禁时长必须是数字或 "forever"');
          return;
        }
        
        // 临时IP封禁
        for (const [id, player] of Object.entries(gameState.players)) {
          if (player.username.toLowerCase() === banIPUsername.toLowerCase()) {
            const expires = Date.now() + days * 24 * 60 * 60 * 1000;
            gameState.bannedIPs[player.ip] = {
              reason: '管理员IP封禁',
              expires
            };
            
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
              socket.emit('banned', { reason: `管理员IP封禁 ${days} 天`, expires });
              socket.disconnect();
            }
            
            usedUsernames.delete(player.username);
            delete gameState.players[id];
            gameState.playerCount--;
            log(`已IP封禁玩家 ${player.username} (${player.ip}) ${days} 天`);
            return;
          }
        }
        
        console.log(`未找到玩家: ${banIPUsername}`);
      }
      break;
      
    case '/create':
      if (parts.length < 3) {
        console.log('用法: /create [npc/boss] <生成个数>');
        return;
      }
      
      const createType = parts[1].toLowerCase();
      const createCount = parseInt(parts[2]);
      
      if (isNaN(createCount) || createCount <= 0) {
        console.log('生成个数必须是正整数');
        return;
      }
      
      if (createType === 'npc') {
        for (let i = 0; i < createCount; i++) {
          generateNPC();
        }
        log(`已生成 ${createCount} 个NPC`);
      } else if (createType === 'boss') {
        const currentBossCount = Object.keys(gameState.bosses).length;
        const maxBossCount = config.max_boss_count || 2;
        
        if (currentBossCount >= maxBossCount) {
          console.log(`BOSS数量已达上限 (${maxBossCount}个)`);
          return;
        }
        
        const actualCount = Math.min(createCount, maxBossCount - currentBossCount);
        for (let i = 0; i < actualCount; i++) {
          generateBoss();
        }
        log(`已生成 ${actualCount} 个BOSS`);
      } else {
        console.log('类型必须是 "npc" 或 "boss"');
      }
      break;
      
    case '/kill':
      if (parts.length < 2) {
        console.log('用法: /kill [玩家名称] 或 /kill all');
        return;
      }
      
      const killTarget = parts.slice(1).join(' ');
      
      if (killTarget === 'all') {
        for (const [id, player] of Object.entries(gameState.players)) {
          playerDeath(id);
        }
        log(`已击杀所有玩家`);
      } else {
        let found = false;
        
        for (const [id, player] of Object.entries(gameState.players)) {
          if (player.username.toLowerCase() === killTarget.toLowerCase()) {
            playerDeath(id);
            log(`已击杀玩家: ${player.username} (${player.ip})`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          console.log(`未找到玩家: ${killTarget}`);
        }
      }
      break;
      
    case '/shutdown':
      log('服务器即将关闭');
      io.emit('server_shutdown');
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      break;
      
    case '/help':
      console.log('可用命令:');
      console.log('/list : 列出所有玩家名称和玩家所属IP地址');
      console.log('/clear : 清除所有NPC和BOSS');
      console.log('/clearnpcs : 清除所有NPC');
      console.log('/kick all : 踢出所有玩家');
      console.log('/kick [玩家名称] : 踢出该玩家');
      console.log('/find [玩家名称] : 查找该玩家是否在线（不区分大小写，雷同度高也列在查找名单内）');
      console.log('/check [玩家名称] : 查询该玩家的基本信息');
      console.log('/ban <封禁时长（天）> [玩家名称] : 临时封禁该玩家');
      console.log('/ban forever [玩家名称] : 永久封禁该玩家');
      console.log('/banip <封禁时长（天）> [玩家名称] : 临时封禁该玩家');
      console.log('/banip forever [玩家名称] : 永久封禁该玩家');
      console.log('/create [npc/boss] <生成个数> : 生成若干自动程序控制的NPC或BOSS（BOSS最多只能在场两个）');
      console.log('/kill [玩家名称] : 立刻击杀该玩家');
      console.log('/kill all : 立即击杀在场的所有玩家');
      console.log('/shutdown : 向客户端发送停服讯息，并立即关闭服务端程序');
      console.log('/help : 显示帮助信息');
      break;
      
    default:
      if (input.startsWith('/')) {
        console.log(`未知命令: ${command}，输入 /help 查看可用命令`);
      }
  }
}

rl.on('line', (input) => {
  processCommand(input);
  rl.prompt();
});

// 提供静态文件服务
app.use(express.static(path.join(__dirname, '../client')));

// Socket.IO会自动处理/socket.io/路径
// 无需额外路由

// 启动服务器
const PORT = config.port || 25596;
server.listen(PORT, () => {
  log(`服务器已启动，端口为${PORT}`);
  
  // 初始化游戏
  loadUsernames();
  initializeNPCs();
  
  // 显示命令提示符
  rl.prompt();
});

// 优雅关闭
process.on('SIGINT', () => {
  log('服务器正在关闭...');
  io.emit('server_shutdown');
  server.close(() => {
    log('服务器已关闭');
    process.exit(0);
  });
});