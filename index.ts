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
setupSwagger(app)

app.get('/', (_req, res) => {
  res.send('Servidor Real-time de WebSockets funcionando en puerto 3001')
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// roomId -> Map<socketId, { username, uid }>
const activeUsers: Map<
  string,
  Map<string, { username: string; uid: string }>
> = new Map()

const roomsCollection = collection(db, 'rooms')
const messagesCollection = collection(db, 'messages')

io.on('connection', (socket: Socket) => {
  // ✅ FIX CRÍTICO: capturar socket.id INMEDIATAMENTE, antes de cualquier async.
  // En Socket.IO v4, socket.id puede quedar undefined si se accede después de
  // un await porque el contexto del socket puede cambiar o perderse en ciertas
  // versiones. Capturarlo aquí garantiza que siempre sea el valor correcto.
  const mySocketId = socket.id
  console.log(`Cliente conectado: ${mySocketId}`)

  // ────────────────────────────────────────────────
  // SEÑALIZACIÓN WebRTC — relay puro entre peers
  // ────────────────────────────────────────────────
  socket.on('signal', (to: string, _from: string, data: unknown) => {
    // ✅ Usar mySocketId del servidor en vez del 'from' del cliente,
    // ya que el cliente puede enviar socket.id como undefined.
    if (io.sockets.sockets.has(to)) {
      io.to(to).emit('signal', to, mySocketId, data)
    } else {
      console.warn(`[signal] Peer ${to} no encontrado`)
    }
  })

  // ────────────────────────────────────────────────
  // UNIRSE A SALA
  // ────────────────────────────────────────────────
  socket.on(
    'join-room',
    async (data: { roomId: string; username: string; uid: string }) => {
      const { roomId, username, uid } = data

      if (!roomId || !username || !uid) {
        socket.emit('error-msg', 'Datos incompletos para ingresar a la sala')
        return
      }

      try {
        const q = query(roomsCollection, where('roomId', '==', roomId))
        const snapshot: QuerySnapshot<DocumentData> = await getDocs(q)

        if (snapshot.empty) {
          socket.emit('room-invalid', 'La sala no existe o el ID es inválido')
          return
        }

        const roomData = snapshot.docs[0].data()

        socket.join(roomId)

        if (!activeUsers.has(roomId)) {
          activeUsers.set(roomId, new Map())
        }
        // ✅ Usar mySocketId (capturado antes del await) en lugar de socket.id
        activeUsers.get(roomId)!.set(mySocketId, { username, uid })

        const currentUsersList = Array.from(
          activeUsers.get(roomId)!,
          ([socketId, user]) => ({ ...user, socketId })
        )

        socket.emit('room-joined-success', {
          roomId,
          roomName: roomData.name,
          hostUid: roomData.hostUid,
          activeUsers: currentUsersList,
          // ✅ FIX CRÍTICO: usar mySocketId capturado antes del await
          mySocketId: mySocketId
        })

        socket.to(roomId).emit('new-peer-joined', {
          // ✅ Usar mySocketId aquí también
          peerId: mySocketId,
          username,
          uid,
          activeUsers: currentUsersList
        })

        // Historial de mensajes
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

  // ────────────────────────────────────────────────
  // ELIMINAR SALA
  // ────────────────────────────────────────────────
  socket.on('delete-room', async (data: { roomId: string; uid: string }) => {
    const { roomId, uid } = data
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
        await deleteDoc(querySnapshot.docs[0].ref)

        io.to(roomId).emit('delete-room', {
          roomId,
          message: 'La sala ha sido eliminada por el host'
        })

        activeUsers.delete(roomId)
        console.log(`Sala ${roomId} eliminada`)
      }
    } catch (error) {
      console.error('Error al eliminar sala:', error)
    }
  })

  // ────────────────────────────────────────────────
  // MENSAJES DE CHAT
  // ────────────────────────────────────────────────
  socket.on(
    'send-message',
    async (data: {
      roomId: string
      senderUid: string
      senderUsername: string
      text: string
    }) => {
      const { roomId, senderUid, senderUsername, text } = data
      if (!roomId || !senderUid || !senderUsername || !text?.trim()) return

      try {
        const docRef = await addDoc(messagesCollection, {
          roomId,
          senderUid,
          senderUsername,
          text: text.trim(),
          createdAt: Timestamp.now()
        })

        io.to(roomId).emit('receive-message', {
          id: docRef.id,
          roomId,
          senderUid,
          senderUsername,
          text: text.trim(),
          createdAt: new Date()
        })
      } catch (error) {
        console.error('Error al guardar mensaje:', error)
        socket.emit('error-msg', 'No se pudo enviar el mensaje')
      }
    }
  )

  // ────────────────────────────────────────────────
  // DESCONEXIÓN
  // ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${mySocketId}`)

    for (const [roomId, usersMap] of activeUsers.entries()) {
      // ✅ Usar mySocketId capturado, no socket.id
      if (usersMap.has(mySocketId)) {
        const userInfo = usersMap.get(mySocketId)!
        usersMap.delete(mySocketId)

        const currentUsersList = Array.from(usersMap, ([socketId, user]) => ({
          ...user,
          socketId
        }))

        io.to(roomId).emit('userDisconnected', mySocketId)
        io.to(roomId).emit('user-left', {
          username: userInfo.username,
          uid: userInfo.uid,
          activeUsers: currentUsersList
        })

        if (usersMap.size === 0) activeUsers.delete(roomId)
      }
    }
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Real-time activo en http://localhost:${PORT}`)
})
