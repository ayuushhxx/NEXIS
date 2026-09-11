import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDbPath = path.resolve(__dirname, '../../prisma/dev.db').replace(/\\/g, '/')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('./')
        ? process.env.DATABASE_URL
        : `file:${defaultDbPath}`,
    },
  },
})

export default prisma
