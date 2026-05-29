import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import db from './firebase.js';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
const PORT = 3001;
const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (_req, res) => {
    res.send('Servidor Real-time de WebSockets funcionando en puerto 3001');
});
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
// Memory tracking of active users in rooms
// roomId -> Map of socket.id -> { username, uid }
const activeUsers = new Map();
// Firestore collections
const roomsCollection = collection(db, 'rooms');
const messagesCollection = collection(db, 'messages');
io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);
    // 1. Join room and validate existence
    socket.on('join-room', async (data) => {
        const { roomId, username, uid } = data;
        if (!roomId || !username || !uid) {
            socket.emit('error-msg', 'Datos incompletos para ingresar a la sala');
            return;
        }
        try {
            // Validate that room exists in Firestore
            const q = query(roomsCollection, where('roomId', '==', roomId));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                socket.emit('room-invalid', 'La sala no existe o el ID es inválido');
                return;
            }
            const roomData = snapshot.docs[0].data();
            // Join the socket room
            socket.join(roomId);
            // Add user to active presence map
            if (!activeUsers.has(roomId)) {
                activeUsers.set(roomId, new Map());
            }
            activeUsers.get(roomId).set(socket.id, { username, uid });
            console.log(`Usuario @${username} se unió a la sala: ${roomId}`);
            // Notify other users in the room
            const currentUsersList = Array.from(activeUsers.get(roomId).values());
            // Emit events
            socket.emit('room-joined-success', {
                roomId,
                roomName: roomData.name,
                hostUid: roomData.hostUid,
                activeUsers: currentUsersList
            });
            socket.to(roomId).emit('user-joined', {
                username,
                uid,
                activeUsers: currentUsersList
            });
            // Send latest messages from Firestore for this room
            try {
                const qMessages = query(messagesCollection, where('roomId', '==', roomId));
                const msgSnapshot = await getDocs(qMessages);
                const messages = msgSnapshot.docs
                    .map((doc) => {
                    const m = doc.data();
                    return {
                        id: doc.id,
                        roomId: m.roomId,
                        senderUid: m.senderUid,
                        senderUsername: m.senderUsername,
                        text: m.text,
                        createdAt: m.createdAt?.toDate?.() || new Date()
                    };
                })
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                socket.emit('room-history', messages);
            }
            catch (err) {
                console.error('Error al cargar historial de mensajes:', err);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Error desconocido al validar sala';
            socket.emit('error-msg', msg);
        }
    });
    // 2. Routing messages and saving to Firestore
    socket.on('send-message', async (data) => {
        const { roomId, senderUid, senderUsername, text } = data;
        if (!roomId || !senderUid || !senderUsername || !text || text.trim().length === 0) {
            return;
        }
        try {
            // Save message to Firestore
            const docRef = await addDoc(messagesCollection, {
                roomId,
                senderUid,
                senderUsername,
                text: text.trim(),
                createdAt: Timestamp.now()
            });
            const messageObj = {
                id: docRef.id,
                roomId,
                senderUid,
                senderUsername,
                text: text.trim(),
                createdAt: new Date()
            };
            // Broadcast message to everyone in the room
            io.to(roomId).emit('receive-message', messageObj);
        }
        catch (error) {
            console.error('Error al guardar mensaje en Firestore:', error);
            socket.emit('error-msg', 'No se pudo enviar el mensaje');
        }
    });
    // 3. User disconnects
    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        // Search and remove user from presence list across all rooms
        for (const [roomId, usersMap] of activeUsers.entries()) {
            if (usersMap.has(socket.id)) {
                const userInfo = usersMap.get(socket.id);
                usersMap.delete(socket.id);
                const currentUsersList = Array.from(usersMap.values());
                // Notify other room users
                io.to(roomId).emit('user-left', {
                    username: userInfo.username,
                    uid: userInfo.uid,
                    activeUsers: currentUsersList
                });
                // Clean up empty rooms
                if (usersMap.size === 0) {
                    activeUsers.delete(roomId);
                }
            }
        }
    });
});
httpServer.listen(PORT, () => {
    console.log(`Servidor Real-time activo en http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map