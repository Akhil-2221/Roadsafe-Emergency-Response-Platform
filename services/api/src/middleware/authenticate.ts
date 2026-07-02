import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { redis } from '../config/redis'
import { prisma } from '../config/database'
import { AppError } from '../utils/AppError'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string }
      requestId?: string
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401)
    }
    const token = authHeader.split(' ')[1]

    // Check blacklist in Redis
    const blacklisted = await redis.get(`blacklist:${token}`)
    if (blacklisted) throw new AppError('Token has been revoked. Please log in again.', 401)

    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, isActive: true },
    })

    if (!user) throw new AppError('User not found', 401)
    if (!user.isActive) throw new AppError('Account is deactivated', 403)

    req.user = { id: user.id, email: user.email, role: user.role }
    next()
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid or expired token', 401))
    }
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired. Please refresh your session.', 401))
    }
    next(err)
  }
}

export const requireRole = (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403))
    }
    next()
  }
