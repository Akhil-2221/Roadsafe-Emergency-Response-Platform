import { env } from '../config/env'
import { logger } from '../config/logger'

export async function callAiService(endpoint: string, payload: object): Promise<any> {
  const url = `${env.AI_SERVICE_URL}${endpoint}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.AI_SERVICE_KEY ? { 'X-Service-Key': env.AI_SERVICE_KEY } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000), // 30s timeout
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('AI service error', { endpoint, status: response.status, error: errorText })
    throw new Error(`AI service returned ${response.status}`)
  }

  return response.json()
}
