import type { Bridge } from './index'

declare global {
  interface Window {
    api: Bridge
  }
}
