import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { redis } from '../config/redis'
import { prisma } from '../config/database'
import { AppError } from './AppError'

// ─── asyncHandler ────────────────────────────────────────────────
export const asyncHandler = (fn: Function) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next)
