import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {

    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    })

    if (!result.success) {

      // ===== DEBUG VALIDATION ERRORS =====
      console.log('\n=====================================')
      console.log('❌ VALIDATION FAILED')
      console.log('Request Body:')
      console.log(JSON.stringify(req.body, null, 2))

      console.log('\nValidation Errors:')
      console.log(JSON.stringify(result.error.errors, null, 2))
      console.log('=====================================\n')
      // ================================

      const formatted: Record<string, string[]> = {}

      result.error.errors.forEach(err => {
        const key = err.path.slice(1).join('.') || 'general'

        if (!formatted[key]) {
          formatted[key] = []
        }

        formatted[key].push(err.message)
      })

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: formatted,
      })
    }

    if (result.data.body) {
      req.body = result.data.body
    }

    next()
  }