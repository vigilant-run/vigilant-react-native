import { Attributes } from './attributes'
import axios from 'axios'

var globalLogger: Logger | null = null

export function initLogger(options: LoggerOptions) {
  globalLogger = new Logger(options)
}

export async function shutdownLogger() {
  if (!globalLogger) return
  await globalLogger.shutdown()
}

export function logDebug(message: string, attrs: Attributes = {}) {
  if (!globalLogger) return
  globalLogger.debug(message, attrs)
}

export function logInfo(message: string, attrs: Attributes = {}) {
  if (!globalLogger) return
  globalLogger.info(message, attrs)
}

export function logWarn(message: string, attrs: Attributes = {}) {
  if (!globalLogger) return
  globalLogger.warn(message, attrs)
}

export function logError(
  message: string,
  error: Error | null = null,
  attrs: Attributes = {},
) {
  if (!globalLogger) return
  globalLogger.error(message, error, attrs)
}

export function enableLogAutocapture() {
  if (!globalLogger) return
  globalLogger.autocapture_enable()
}

export function disableLogAutocapture() {
  if (!globalLogger) return
  globalLogger.autocapture_disable()
}

export interface LoggerOptions {
  name?: string
  endpoint?: string
  token?: string
  insecure?: boolean
  passthrough?: boolean
}

export class Logger {
  private originalConsoleLog: typeof console.log | null = null
  private originalConsoleError: typeof console.error | null = null
  private stdoutFunction: ((message: string) => void) | null = null
  private stderrFunction: ((message: string) => void) | null = null

  private passthrough: boolean
  private name: string
  private endpoint: string
  private token: string
  private insecure: boolean

  private logsQueue: log[] = []
  private batchStop = false
  private batcherPromise: Promise<void> | null = null
  private batchInterval = 100
  private maxBatchSize = 100

  constructor(options: LoggerOptions) {
    this.passthrough = options.passthrough ?? true
    this.name = options.name ?? 'sample-app'
    this.endpoint = options.endpoint ?? 'ingress.vigilant.run'
    this.token = options.token ?? 'tk_1234567890'
    this.insecure = options.insecure ?? false

    this.setupIODefaults()

    this.startBatcher()
  }

  debug(message: string, attrs: Attributes = {}): void {
    this.log(logLevel.DEBUG, message, attrs)
    this.stdOutPassthrough(message)
  }

  info(message: string, attrs: Attributes = {}): void {
    this.log(logLevel.INFO, message, attrs)
    this.stdOutPassthrough(message)
  }

  warn(message: string, attrs: Attributes = {}): void {
    this.log(logLevel.WARNING, message, attrs)
    this.stdOutPassthrough(message)
  }

  error(
    message: string,
    error: Error | null = null,
    attrs: Attributes = {},
  ): void {
    this.log(logLevel.ERROR, message, attrs, error)
    this.stdErrPassthrough(message)
  }

  autocapture_enable() {
    this.redirectConsoleLog()
    this.redirectConsoleError()
  }

  autocapture_disable() {
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog
    }
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError
    }
  }

  async shutdown(): Promise<void> {
    this.batchStop = true
    if (this.batcherPromise) {
      await this.batcherPromise
    }
  }

  private log(
    level: logLevel,
    message: string,
    attrs: Attributes,
    error: Error | null = null,
  ): void {
    this.logsQueue.push({
      timestamp: getNowTimestamp(),
      body: message,
      level: level,
      attributes: {
        ...attrs,
        ...(error ? { error: error.message } : {}),
        'service.name': this.name,
      },
    })
  }

  private startBatcher() {
    this.batcherPromise = new Promise<void>((resolve) => {
      const runBatcher = async () => {
        while (!this.batchStop) {
          await this.flushBatch()
          await new Promise((r) => setTimeout(r, this.batchInterval))
        }
        await this.flushBatch(true)
        resolve()
      }
      runBatcher()
    })
  }

  private async flushBatch(force = false) {
    if (this.logsQueue.length === 0) return

    while (this.logsQueue.length > 0) {
      const batch = this.logsQueue.splice(0, this.maxBatchSize)
      await this.sendBatch(batch)
      if (!force) break
    }
  }

  private async sendBatch(batch: log[]) {
    if (batch.length === 0) return

    const payload: messageBatch = {
      token: this.token,
      type: 'logs',
      logs: batch,
    }

    try {
      const endpoint = formatEndpoint(this.endpoint, this.insecure)
      await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {}
  }

  private setupIODefaults() {
    this.originalConsoleLog = console.log
    this.originalConsoleError = console.error
    this.stdoutFunction = (message: string) => {
      if (this.originalConsoleLog) {
        this.originalConsoleLog(message)
      }
    }
    this.stderrFunction = (message: string) => {
      if (this.originalConsoleError) {
        this.originalConsoleError(message)
      }
    }
  }

  private redirectConsoleLog() {
    const loggerInfo = this.info.bind(this)
    console.log = function (...args: any[]): void {
      const message = args
        .map((arg) => {
          if (typeof arg === 'string') {
            return arg
          } else if (arg === null) {
            return 'null'
          } else if (arg === undefined) {
            return 'undefined'
          } else if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg)
            } catch (e) {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      loggerInfo(message)
    }
  }

  private redirectConsoleError() {
    const loggerError = this.error.bind(this)
    console.error = function (...args: any[]): void {
      const message = args
        .map((arg) => {
          if (typeof arg === 'string') {
            return arg
          } else if (arg === null) {
            return 'null'
          } else if (arg === undefined) {
            return 'undefined'
          } else if (arg instanceof Error) {
            return arg.message
          } else if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg)
            } catch (e) {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      const errorObj = args.find((arg) => arg instanceof Error) as
        | Error
        | undefined

      if (errorObj) {
        loggerError(message, errorObj, {})
      } else {
        loggerError(message)
      }
    }
  }

  private stdOutPassthrough(message: string): void {
    if (!this.passthrough) return
    if (this.stdoutFunction) {
      this.stdoutFunction(message)
    }
  }

  private stdErrPassthrough(message: string): void {
    if (!this.passthrough) return
    if (this.stderrFunction) {
      this.stderrFunction(message)
    }
  }
}

function formatEndpoint(
  endpoint: string | undefined,
  insecure: boolean | undefined,
): string {
  if (endpoint == '') {
    return 'ingress.vigilant.run/api/message'
  } else if (insecure) {
    return `http://${endpoint}/api/message`
  } else {
    return `https://${endpoint}/api/message`
  }
}

function getNowTimestamp(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z')
}

enum logLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

type log = {
  timestamp: string
  body: string
  level: logLevel
  attributes: Attributes
}

type messageBatchType = 'logs'

type messageBatch = {
  token: string
  type: messageBatchType
  logs: log[]
}
