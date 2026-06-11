import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import db from './firebase.js'
import { setupSwagger } from './swagger.js'

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
  deleteDoc
} from 'firebase/firestore'
import type { DocumentData, QuerySnapshot } from 'firebase/firestore'


const PORT = Number(process.env.PORT) || 3001
const app = express()

app.use(cors())
app.use(express.json())

// Swagger documentation — available at /api-docs
setupSwagger(app)

app.get('/', (_req, res) => {
  res.send('Servidor Real-time de WebSockets funcionando en puerto 3001')
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})
const peers: any = {}

// Memory tracking of active users in rooms
// roomId -> Map of socket.id -> { username, uid }
const activeUsers: Map<
  string,
  Map<string, { username: string; uid: string }>
> = new Map()

// Firestore collections
const roomsCollection = collection(db, 'rooms')
const messagesCollection = collection(db, 'messages')

io.on('connection', (socket: Socket) => {
  console.log(`Cliente conectado: ${socket.id}`)
  if (!peers[socket.id]) {
    peers[socket.id] = {}
    socket.emit('introduction', Object.keys(peers))
    io.emit('newUserConnected', socket.id)
    console.log(
      'Peer joined with ID',
      socket.id,
      '. There are ' + io.engine.clientsCount + ' peer(s) connected.'
    )
  }
  socket.on('signal', (to, from, data) => {
    if (to in peers) {
      io.to(to).emit('signal', to, from, data)
    } else {
      console.log('Peer not found!')
    }
  })
  // 1. Join room and validate existence
  socket.on(
    'join-room',
    async (data: { roomId: string; username: string; uid: string }) => {
      const { roomId, username, uid } = data

      if (!roomId || !username || !uid) {
        socket.emit('error-msg', 'Datos incompletos para ingresar a la sala')
        return
      }

      try {
        // Validate that room exists in Firestore
        const q = query(roomsCollection, where('roomId', '==', roomId))
        const snapshot: QuerySnapshot<DocumentData> = await getDocs(q)

        if (snapshot.empty) {
          socket.emit('room-invalid', 'La sala no existe o el ID es inválido')
          return
        }

        const roomData = snapshot.docs[0].data()

        // Join the socket room
        socket.join(roomId)

        // Add user to active presence map
        if (!activeUsers.has(roomId)) {
          activeUsers.set(roomId, new Map())
        }
        activeUsers.get(roomId)!.set(socket.id, { username, uid })

        console.log(`Usuario @${username} se unió a la sala: ${roomId}`)

        // Notify other users in the room
        const currentUsersList = Array.from(activeUsers.get(roomId)!.values())

        // Emit events
        socket.emit('room-joined-success', {
          roomId,
          roomName: roomData.name,
          hostUid: roomData.hostUid,
          activeUsers: currentUsersList
        })

        socket.to(roomId).emit('user-joined', {
          username,
          uid,
          activeUsers: currentUsersList
        })

        // Send latest messages from Firestore for this room
        try {
          const qMessages = query(
            messagesCollection,
            where('roomId', '==', roomId)
          )
          const msgSnapshot = await getDocs(qMessages)
          const messages = msgSnapshot.docs
            .map((doc) => {
              const m = doc.data()
              return {
                id: doc.id,
                roomId: m.roomId,
                senderUid: m.senderUid,
                senderUsername: m.senderUsername,
                text: m.text,
                createdAt: m.createdAt?.toDate?.() || new Date()
              }
            })
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

          socket.emit('room-history', messages)
        } catch (err) {
          console.error('Error al cargar historial de mensajes:', err)
        }
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Error desconocido al validar sala'
        socket.emit('error-msg', msg)
      }
    }
  )

  socket.on('delete-room', async (data: { roomId: string; uid: string }) => {
    const { roomId, uid } = data
    console.log('DELETE ROOM DATA:', data)
    if (!roomId || !uid) {
      socket.emit('error-msg', 'Datos incompletos para eliminar la sala')
      return
    }

    try {
      const q = query(
        collection(db, 'rooms'),
        where('hostUid', '==', uid),
        where('roomId', '==', roomId)
      )
      const querySnapshot = await getDocs(q)

      if (!querySnapshot.empty) {
        console.log('Eliminando sala:', roomId)
        const roomDoc = querySnapshot.docs[0]
        console.log('Documentos encontrados:', querySnapshot.size)
        querySnapshot.forEach((doc) => {
          console.log(doc.id, doc.data())
        })
        await deleteDoc(roomDoc.ref)
        console.log('SALA ELIMINADA')

        io.to(roomId).emit('room-deleted', {
          message: 'La sala ha sido eliminada por el host',
          roomId: roomId,
          uid: uid
        })
        socket.emit('room-deleted', {
          message: 'La sala ha sido eliminada por el host',
          roomId: roomId,
          uid: uid
        })
        activeUsers.delete(roomId)
      }
    } catch (error) {
      console.log(error)
    }
  })
  // 2. Routing messages and saving to Firestore
  socket.on(
    'send-message',
    async (data: {
      roomId: string
      senderUid: string
      senderUsername: string
      text: string
    }) => {
      const { roomId, senderUid, senderUsername, text } = data

      if (
        !roomId ||
        !senderUid ||
        !senderUsername ||
        !text ||
        text.trim().length === 0
      ) {
        return
      }

      try {
        // Save message to Firestore
        const docRef = await addDoc(messagesCollection, {
          roomId,
          senderUid,
          senderUsername,
          text: text.trim(),
          createdAt: Timestamp.now()
        })

        const messageObj = {
          id: docRef.id,
          roomId,
          senderUid,
          senderUsername,
          text: text.trim(),
          createdAt: new Date()
        }

        // Broadcast message to everyone in the room
        io.to(roomId).emit('receive-message', messageObj)
      } catch (error) {
        console.error('Error al guardar mensaje en Firestore:', error)
        socket.emit('error-msg', 'No se pudo enviar el mensaje')
      }
    }
  )

  // 3. User disconnects
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`)
    delete peers[socket.id]
    io.sockets.emit('userDisconnected', socket.id)
    console.log(
      'Peer disconnected with ID',
      socket.id,
      '. There are ' + io.engine.clientsCount + ' peer(s) connected.'
    )
    // Search and remove user from presence list across all rooms
    for (const [roomId, usersMap] of activeUsers.entries()) {
      if (usersMap.has(socket.id)) {
        const userInfo = usersMap.get(socket.id)!
        usersMap.delete(socket.id)

        const currentUsersList = Array.from(usersMap.values())

        // Notify other room users
        io.to(roomId).emit('user-left', {
          username: userInfo.username,
          uid: userInfo.uid,
          activeUsers: currentUsersList
        })

        // Clean up empty rooms
        if (usersMap.size === 0) {
          activeUsers.delete(roomId)
        }
      }
    }
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Real-time activo en http://localhost:${PORT}`)
})
