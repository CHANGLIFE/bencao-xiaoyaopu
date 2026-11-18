const { isEligible, fieldVerified, verifiedShortEffect, toDisplay } = require('./catalog')

const ENGINE_VERSION = 1
const SNAPSHOT_VERSION = 1
const copy = value => JSON.parse(JSON.stringify(value))
const unique = values => Array.isArray(values) && new Set(values).size === values.length
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function getEligible(catalog) {
  if (!Array.isArray(catalog)) return []
  const counts = new Map()
  catalog.forEach(entry => {
    if (entry) counts.set(entry.id, (counts.get(entry.id) || 0) + 1)
  })
  return catalog.filter(entry => entry && counts.get(entry.id) === 1 && isEligible(entry)).map(copy)
}

function search(catalog, query) {
  const needle = String(query == null ? '' : query).trim().toLowerCase()
  return (Array.isArray(catalog) ? catalog : []).filter(entry => {
    if (!entry) return false
    const names = [entry.name].concat(Array.isArray(entry.aliases) ? entry.aliases : [])
    if (fieldVerified(entry, 'effect')) names.push(entry.effect, verifiedShortEffect(entry))
    return names.some(value => typeof value === 'string' && value.toLowerCase().includes(needle))
  }).map(entry => copy(toDisplay(entry)))
}

function shuffle(values, random) {
  const result = values.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机函数须返回[0,1)内数值')
    const j = Math.floor(value * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function createRound(pool, roundIndex = 0, reviewIds = [], previousDrawerOrder = [], random = Math.random) {
  if (!Number.isSafeInteger(roundIndex) || roundIndex < 0) throw new TypeError('轮次必须是非负整数')
  if (!Array.isArray(reviewIds) || !Array.isArray(previousDrawerOrder)) throw new TypeError('复习ID和抽屉顺序必须是数组')
  const eligible = getEligible(pool)
  if (eligible.length < 6) throw new RangeError('合格药材不足6味，无法开始练习')
  const poolIds = eligible.map(entry => entry.id)
  const review = [...new Set(reviewIds)]
  if (review.some(id => !poolIds.includes(id))) throw new RangeError('复习项包含未准入药材')
  const mode = review.length ? 'review' : 'normal'
  const start = ((roundIndex % poolIds.length) * 6) % poolIds.length
  const group = Array.from({ length: 6 }, (_, i) => poolIds[(start + i) % poolIds.length])
  const selected = mode === 'review' ? review.slice(0, 6) : group
  const drawers = selected.concat(group, poolIds).filter((id, i, all) => all.indexOf(id) === i).slice(0, 6)
  let drawerIds = shuffle(drawers, random)
  if (same(drawerIds, previousDrawerOrder)) drawerIds = drawerIds.slice(1).concat(drawerIds[0])
  const trayIds = shuffle(selected, random)
  return {
    engineVersion: ENGINE_VERSION, mode, roundIndex, poolIds, drawerIds, trayIds,
    reviewIds: review, completedIds: [], cursor: 0, status: 'awaiting',
    attempts: {}, lastEvent: null
  }
}

function currentId(state) {
  return state.status === 'completed' ? null : state.trayIds[state.cursor]
}

function recordReview(state, id) {
  if (!state.reviewIds.includes(id)) state.reviewIds.push(id)
}

function guess(state, drawerId) {
  if (state.status !== 'awaiting') return copy(state)
  if (!state.drawerIds.includes(drawerId)) throw new RangeError('目标抽屉不存在')
  const next = copy(state)
  const id = currentId(next)
  const attempt = Object.prototype.hasOwnProperty.call(next.attempts, id)
    ? next.attempts[id] : { wrong: 0, hints: 0, correct: false }
  Object.defineProperty(next.attempts, id, { value: attempt, enumerable: true, writable: true, configurable: true })
  if (drawerId !== id) {
    attempt.wrong += 1
    recordReview(next, id)
    next.lastEvent = { type: 'wrong', id, drawerId }
  } else {
    attempt.correct = true
    next.status = 'placed'
    if (next.mode === 'review' && attempt.wrong === 0 && attempt.hints === 0) {
      next.reviewIds = next.reviewIds.filter(value => value !== id)
    }
    next.lastEvent = { type: 'correct', id, drawerId }
  }
  return next
}

function hint(state) {
  if (state.status !== 'awaiting') return copy(state)
  const next = copy(state)
  const id = currentId(next)
  const attempt = Object.prototype.hasOwnProperty.call(next.attempts, id)
    ? next.attempts[id] : { wrong: 0, hints: 0, correct: false }
  Object.defineProperty(next.attempts, id, { value: attempt, enumerable: true, writable: true, configurable: true })
  attempt.hints += 1
  recordReview(next, id)
  next.lastEvent = { type: 'hint', id }
  return next
}

function advance(state) {
  if (state.status !== 'placed') return copy(state)
  const next = copy(state)
  next.completedIds.push(currentId(next))
  next.cursor += 1
  next.status = next.cursor === next.trayIds.length ? 'completed' : 'awaiting'
  next.lastEvent = { type: next.status === 'completed' ? 'completed' : 'advance', id: next.completedIds[next.completedIds.length - 1] }
  return next
}

function validateState(state, catalog) {
  if (!state || state.engineVersion !== ENGINE_VERSION) return false
  const { poolIds, drawerIds, trayIds, reviewIds, completedIds, cursor, status, attempts } = state
  const lists = [poolIds, drawerIds, trayIds, reviewIds, completedIds]
  if (!lists.every(list => unique(list) && list.every(id => typeof id === 'string' && id.length > 0))) return false
  if (poolIds.length < 6 || drawerIds.length !== 6 || trayIds.length < 1 || trayIds.length > 6) return false
  if (!['normal', 'review'].includes(state.mode) || (state.mode === 'normal' && trayIds.length !== 6)) return false
  if (!Number.isSafeInteger(state.roundIndex) || state.roundIndex < 0) return false
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > trayIds.length) return false
  if (!['awaiting', 'placed', 'completed'].includes(status)) return false
  if ((status === 'completed') !== (cursor === trayIds.length)) return false
  if (!same(completedIds, trayIds.slice(0, cursor))) return false
  if (!drawerIds.every(id => poolIds.includes(id)) || !reviewIds.every(id => poolIds.includes(id))) return false
  if (!trayIds.every(id => drawerIds.includes(id))) return false
  if (!attempts || typeof attempts !== 'object' || Array.isArray(attempts)) return false
  const attempted = Object.keys(attempts)
  if (!attempted.every(id => trayIds.includes(id) && trayIds.indexOf(id) <= cursor)) return false
  for (const id of attempted) {
    const item = attempts[id]
    if (!item || !Number.isSafeInteger(item.wrong) || item.wrong < 0 ||
        !Number.isSafeInteger(item.hints) || item.hints < 0 || typeof item.correct !== 'boolean') return false
    const index = trayIds.indexOf(id)
    const shouldBeCorrect = index < cursor || (index === cursor && status === 'placed')
    if (item.correct !== shouldBeCorrect) return false
    if ((item.wrong > 0 || item.hints > 0) && !reviewIds.includes(id)) return false
  }
  if (!completedIds.every(id => attempts[id] && attempts[id].correct)) return false
  if (status === 'placed' && (!attempts[trayIds[cursor]] || !attempts[trayIds[cursor]].correct)) return false
  if (state.mode === 'review' && !trayIds.slice(cursor).every(id =>
    (status === 'placed' && id === trayIds[cursor]) || reviewIds.includes(id))) return false
  const eligibleIds = getEligible(catalog).map(entry => entry.id)
  if (!poolIds.every(id => eligibleIds.includes(id))) return false
  return true
}

function validateSnapshot(snapshot, catalog) {
  try {
    const value = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot
    return !!value && value.snapshotVersion === SNAPSHOT_VERSION && validateState(value.state, catalog)
  } catch (_) {
    return false
  }
}

function exportSnapshot(state, catalog) {
  const snapshot = { snapshotVersion: SNAPSHOT_VERSION, state: copy(state) }
  if (!validateSnapshot(snapshot, catalog)) throw new TypeError('状态或准入数据无效，不能导出')
  return snapshot
}

function restoreSnapshot(snapshot, catalog) {
  if (!validateSnapshot(snapshot, catalog)) throw new TypeError('存档版本、状态或药材准入校验失败')
  return copy((typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot).state)
}

module.exports = {
  ENGINE_VERSION, SNAPSHOT_VERSION, getEligible, search, createRound,
  currentId, guess, hint, advance, commit: advance,
  validateSnapshot, exportSnapshot, restoreSnapshot
}
