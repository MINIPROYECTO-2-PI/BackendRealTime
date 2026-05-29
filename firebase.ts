import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import type { FirebaseApp } from 'firebase/app'
import type { Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyA1j3mybOpG9gcINcts2Pk8veE_m3VCGJI',
  authDomain: 'mproyecto2-e6d4e.firebaseapp.com',
  projectId: 'mproyecto2-e6d4e',
  storageBucket: 'mproyecto2-e6d4e.firebasestorage.app',
  messagingSenderId: '881475675016',
  appId: '1:881475675016:web:aa61a99fca124074a4903d'
}

const firebase: FirebaseApp = initializeApp(firebaseConfig)
const db: Firestore = getFirestore(firebase)
export default db
