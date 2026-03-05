import 'dotenv/config'
import env from '../config/env.js'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'
const adapter = new PrismaNeon({
  connectionString: env.DATABASE_URL,
})

export const prisma = new PrismaClient({ adapter })

