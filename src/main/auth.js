import os from 'node:os'
import CryptoJS from 'crypto-js'

// 设备指纹与 MAC 采集，对齐原版：mac + hostname + platform + arch + CPU核数，
// JSON 序列化后 SHA-256 取前 32 位 hex。
export function getMac() {
  const skip = /(virtual|vmware|virtualbox|hyper-v|loopback|bluetooth|docker|vethernet|pseudo|bridge|wan miniport|ppp|tunnel|wsl|vEthernet)/i
  const ifaces = os.networkInterfaces()
  const candidates = []
  for (const [name, list] of Object.entries(ifaces)) {
    if (skip.test(name)) continue
    for (const it of list) {
      if (it.internal) continue
      if (it.family !== 'IPv4') continue
      if (!it.mac || it.mac === '00:00:00:00:00:00') continue
      candidates.push({ name, mac: it.mac })
    }
  }
  if (candidates.length) return candidates[0].mac
  return os.hostname()
}

export function getDeviceFingerprint() {
  const obj = {
    mac: getMac(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuCores: os.cpus().length
  }
  const raw = JSON.stringify(obj)
  const fingerprint = CryptoJS.SHA256(raw).toString().slice(0, 32)
  return { fingerprint, raw }
}

export function tokenSignature(token, fingerprint) {
  return CryptoJS.SHA256(`${token}:${fingerprint}`).toString()
}
