import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory data store (replace with your jsonStore logic)
let rooms = [];

// Initialize data from file if it exists
const dataFile = path.join(__dirname, "src/data/chat.json");
try {
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    rooms = data.rooms || [];
  }
} catch {
  console.log("No existing data file, starting with empty rooms");
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(dataFile, JSON.stringify({ rooms }, null, 2));
  } catch (error) {
    console.error("Error saving data:", error);
  }
}

const io = new Server(3001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

console.log("Socket.IO server starting on port 3001...");

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // JOIN ROOM
  socket.on("join-room", (roomId, username) => {
    console.log("User joining room:", roomId, username);
    let room = rooms.find((r) => r.id === roomId);
    if (!room) {
      // Create new room with this user as owner
      room = {
        id: roomId,
        owner: username,
        users: [username],
        messages: [],
      };
      console.log("Creating new room:", room);
      rooms.push(room);
    } else {
      // Add user if not already in room
      if (!room.users.includes(username)) {
        room.users.push(username);
      }
    }
    saveData();
    socket.join(roomId);
    // Notify others in the room
    socket.to(roomId).emit("user-joined", username);
    // Send updated user list to all
    io.to(roomId).emit("user-list", room.users);
    // Optionally, send room info to the joining user
    socket.emit("room-info", room);
  });

  // GET USER ROOMS
  socket.on("get-user-rooms", (username) => {
    const userRooms = rooms.filter((room) => room.users.includes(username));
    socket.emit("user-rooms", userRooms);
  });

  // SEND MESSAGE
  socket.on("send-message", (roomId, message, username) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const msg = {
      message,
      username,
      timestamp: new Date().toISOString(),
    };
    room.messages.push(msg);
    saveData();
    io.to(roomId).emit("receive-message", msg);
  });

  // TYPING INDICATOR
  socket.on("typing", (roomId, username) => {
    socket.to(roomId).emit("user-typing", username);
  });

  // CHECK ROOM EXISTS
  socket.on("check-room-exists", (roomId) => {
    console.log("Checking if room exists:", roomId);
    const exists = rooms.some((room) => room.id === roomId);
    socket.emit("room-exists-result", { roomId, exists });
  });

  // REMOVE USER (owner only)
  socket.on("remove-user", (roomId, owner, targetUser) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    if (room.owner !== owner) return; // Only owner can remove
    if (!room.users.includes(targetUser)) return;
    // Remove user
    room.users = room.users.filter((u) => u !== targetUser);
    // If the removed user was the owner (shouldn't happen here), transfer ownership
    if (room.owner === targetUser) {
      if (room.users.length > 0) {
        room.owner = room.users[0];
      } else {
        // No users left, delete room
        const idx = rooms.findIndex((r) => r.id === roomId);
        if (idx !== -1) rooms.splice(idx, 1);
      }
    }
    saveData();
    // Notify the removed user (if connected)
    io.to(roomId).emit("user-removed", targetUser);
    // Broadcast updated user list
    io.to(roomId).emit("user-list", room.users);
  });

  // LEAVE ROOM
  socket.on("leave-room", (roomId, username) => {
    const roomIdx = rooms.findIndex((r) => r.id === roomId);
    if (roomIdx === -1) return;
    const room = rooms[roomIdx];
    // Remove user from room
    room.users = room.users.filter((u) => u !== username);
    // Ownership transfer or room deletion
    if (room.owner === username) {
      if (room.users.length > 0) {
        room.owner = room.users[0]; // Transfer ownership
      } else {
        rooms.splice(roomIdx, 1); // Delete room if empty
      }
    }
    saveData();
    socket.leave(roomId);
    // Notify others in the room
    socket.to(roomId).emit("user-left", username);
    // Send updated user list
    if (rooms[roomIdx]) {
      io.to(roomId).emit("user-list", rooms[roomIdx].users);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

console.log("Socket.IO server is running on port 3001");
