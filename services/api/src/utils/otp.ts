import bcrypt from 'bcrypt'
import { randomInt } from 'crypto'

export async function generateOtp(): Promise<{ code: string; hash: string }> {
  const code = String(randomInt(100000, 999999)) // 6-digit
  const hash = await bcrypt.hash(code, 10)
  return { code, hash }
}
