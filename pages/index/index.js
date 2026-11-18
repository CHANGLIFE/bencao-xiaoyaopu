const { CATALOG, manifest, toDisplay, fieldVerified } = require('../../data/catalog')
const engine = require('../../data/shop-engine')
const SAVE_KEY = 'bencao-shop-progress-v1'
const BATCH = 40
// 放对后800ms归位动画结束即换成下一味药图，旧药不再留在托盘。
// 辨认要点只留一行文字，停留这个时间后淡出，期间可以直接答下一题。
const RESULT_FADE_DELAY = 1800

function shuffle(list) {
  const result = list.slice()
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const value = result[i]
    result[i] = result[j]
    result[j] = value
  }
  return result
}
function differentOrder(list, previous) {
  let result = shuffle(list)
  if (result.length > 1 && JSON.stringify(result) === JSON.stringify(previous)) result = result.slice(1).concat(result[0])
  return result
}
function display(entry) {
  if (!entry) return null
  const value = toDisplay(entry)
  const nameSource = entry.source || (entry.sources && entry.sources.name)
  const sources = []
  if (nameSource && nameSource.citation) {
    sources.push({ key: 'catalog', label: '品名来源', citation: nameSource.citation, locator: nameSource.locator || '' })
  } else if (entry.catalogId && entry.catalogId.indexOf('chp2025-') === 0) {
    sources.push({ key: 'catalog', label: '品名目录来源（不作功效依据）', citation: manifest.source.title, locator: manifest.source.url + ' · 目录第' + entry.sourcePage + '页 · ' + entry.catalogLabel })
  }
  if (entry.processing && entry.processing.verified && entry.processing.source) {
    sources.push({ key: 'processing', label: '炮制关系依据', citation: entry.processing.source.citation, locator: entry.processing.source.locator })
  }
  Object.keys(entry.sources || {}).forEach(key => {
    const source = entry.sources[key]
    if (source && source.citation) sources.push({ key, label: { effect: '功效依据', recognition: '辨认依据', image: '图像来源', processing: '炮制依据', usage: '药典用途（不作功效）' }[key] || '参考资料', citation: source.citation, locator: source.locator || '' })
  })
  const processing = entry.processing || {}
  const base = CATALOG.find(item => item.id === processing.baseId)
  const relations = []
  if (base) relations.push({ id: base.id, name: base.name, text: '原药材 · ' + (processing.verified ? processing.method || '炮制关联' : '关系待核验') })
  ;(processing.derivedIds || []).forEach(id => {
    const item = CATALOG.find(row => row.id === id)
    if (item) relations.push({ id, name: item.name, text: processing.verified ? '炮制品' : '关系待核验' })
  })
  ;(entry.relatedNames || []).forEach(item => {
    if (!relations.some(row => row.id === item.id)) relations.push({ id: item.id, name: item.name, text: item.verified ? '关联品名' : '关联品名 · 待核验' })
  })
  return Object.assign({}, value, {
    image: value.image, trayImage: value.image, shortEffect: value.shortEffect || (fieldVerified(entry, 'effect') ? entry.effect : (entry.effectNote || '功效待校对')), sourcesList: sources, relations,
    usageText: entry.usageText || '', effectReason: entry.effectReason || '',
    aliasesText: (entry.aliases || []).join('、') || '暂无收录',
    originalNameText: entry.originalName || entry.sourceName || entry.name,
    processingText: processing.verified ? processing.method || '已核对炮制关系' : '炮制关系待核验',
    recognitionBrief: (value.recognition.replace(/^[^：]*：/, '').split(/[，；。]/)[0] || '留意药材外形与纹理') + '。',
    observationBrief: ((value.observationHint || '').split(/[，；。]/)[0] || '留意这味药的外形、颜色和纹理') + '。'
  })
}

Page({
  data: {
    tab: 'shop', tabs: [{ id: 'shop', name: '药铺', mark: '药' }, { id: 'catalog', name: '图鉴', mark: '典' }, { id: 'review', name: '复习', mark: '习' }],
    drawers: [], current: null, roundIndex: 0, progress: 0, total: 6, mode: 'normal', completed: false,
    available: false, busy: false, phase: '', openId: '', wrongId: '', flying: null, flyStyle: '',
    observation: '', knowledge: null, zoom: null, detail: null,
    catalogRows: [], catalogTotal: CATALOG.length, verifiedCount: CATALOG.filter(item => fieldVerified(item, 'effect')).length, catalogBaseCount: manifest.count, loadedCount: 0, hasMore: false, query: '', catalogScrollTop: 0,
    reviewRows: [], reviewCount: 0, eligibleReviewCount: 0, saveWarning: ''
  },

  onLoad() {
    this._pool = engine.getEligible(CATALOG)
    this._reviewIds = []
    this._roundIndex = 0
    this._lastReviewOrder = []
    this._lastDrawerOrder = []
    this._timers = []
    this._token = 0
    this._state = null
    this._normalState = null
    this._knowledgeId = null
    this._visible = true
    this._resultTimer = null
    this.restore()
    if (!this._state && this._pool.length >= 6) this.createNormal(this._roundIndex)
    this.syncView()
    this.searchCatalog('')
    this.refreshReview()
    this.scheduleResultFade()
  },
  onShow() {
    this._visible = true
    if (this._loaded) this.syncView()
    this._loaded = true
    this.scheduleResultFade()
  },
  onHide() { this._visible = false; this.settle(); this.persist() },
  onUnload() { this._visible = false; this.settle(); this.persist(); this.cancelAnimation(); this.clearResultFade() },
  noop() {},

  restore() {
    try {
      const saved = wx.getStorageSync(SAVE_KEY)
      if (!saved) return
      if (saved.version !== 1) {
        this.setData({ saveWarning: '旧进度暂时无法读取，已保留原存档。' })
        return
      }
      const known = new Set(CATALOG.map(entry => entry.id))
      this._reviewIds = Array.isArray(saved.reviewIds) ? [...new Set(saved.reviewIds.filter(id => known.has(id)))] : []
      this._roundIndex = Number.isSafeInteger(saved.roundIndex) && saved.roundIndex >= 0 ? saved.roundIndex : 0
      this._lastReviewOrder = Array.isArray(saved.lastReviewOrder) ? saved.lastReviewOrder : []
      this._lastDrawerOrder = Array.isArray(saved.lastDrawerOrder) ? saved.lastDrawerOrder : []
      this._knowledgeId = known.has(saved.knowledgeId) ? saved.knowledgeId : null
      if (saved.snapshot && engine.validateSnapshot(saved.snapshot, CATALOG)) this._state = engine.restoreSnapshot(saved.snapshot, CATALOG)
      else if (saved.snapshot) this.setData({ saveWarning: '药材资料已更新，本轮将重新整理；复习记录仍保留。' })
      if (saved.normalSnapshot && engine.validateSnapshot(saved.normalSnapshot, CATALOG)) this._normalState = engine.restoreSnapshot(saved.normalSnapshot, CATALOG)
      if (this._state && this._state.status === 'placed') {
        this._knowledgeId = engine.currentId(this._state)
        this._state = engine.commit(this._state)
      }
      if (this._normalState && this._normalState.status === 'placed') this._normalState = engine.commit(this._normalState)
    } catch (error) {
      this.setData({ saveWarning: '暂时无法读取进度，请检查设备存储空间后重试。' })
    }
  },
  persist() {
    try {
      wx.setStorageSync(SAVE_KEY, {
        version: 1, roundIndex: this._roundIndex,
        snapshot: this._state ? engine.exportSnapshot(this._state, CATALOG) : null,
        normalSnapshot: this._normalState ? engine.exportSnapshot(this._normalState, CATALOG) : null,
        reviewIds: this._reviewIds.slice(), knowledgeId: this._knowledgeId,
        lastReviewOrder: this._lastReviewOrder.slice(), lastDrawerOrder: this._lastDrawerOrder.slice(), savedAt: Date.now()
      })
      this.setData({ saveWarning: '' })
      return true
    } catch (error) {
      this.setData({ saveWarning: '进度未能保存。请腾出设备存储空间，再点“重试保存”；离开后可能丢失本次进度。' })
      return false
    }
  },
  retrySave() { this.persist() },
  entry(id) { return display(CATALOG.find(item => item.id === id)) },
  createNormal(index) {
    this._roundIndex = index
    this._knowledgeId = null
    this._state = engine.createRound(this._pool, index, [], this._lastDrawerOrder)
    this._lastDrawerOrder = this._state.drawerIds.slice()
  },
  syncView() {
    const state = this._state
    this.setData({
      available: this._pool.length >= 6, roundIndex: state ? state.roundIndex : this._roundIndex,
      drawers: state ? state.drawerIds.map((id, index) => Object.assign({}, this.entry(id), { index, placed: state.completedIds.includes(id) })) : [],
      current: state ? this.entry(engine.currentId(state)) : null,
      progress: state ? state.completedIds.length : 0, total: state ? state.trayIds.length : 6,
      mode: state ? state.mode : 'normal', completed: !!state && state.status === 'completed',
      knowledge: this.entry(this._knowledgeId)
    })
    this.refreshReview()
  },
  refreshReview() {
    const eligible = new Set(this._pool.map(item => item.id))
    const rows = this._reviewIds.map(id => this.entry(id)).filter(Boolean).map(item => Object.assign({}, item, { canPractice: eligible.has(item.id) && this._pool.length >= 6 }))
    this.setData({ reviewRows: rows, reviewCount: rows.length, eligibleReviewCount: rows.filter(item => item.canPractice).length })
  },
  applyState(next) {
    const before = this._state ? this._state.reviewIds : []
    const removed = before.filter(id => !next.reviewIds.includes(id))
    const added = next.reviewIds.filter(id => !before.includes(id))
    this._reviewIds = [...new Set(this._reviewIds.filter(id => !removed.includes(id)).concat(added))]
    this._state = next
  },
  onTab(event) { this.switchTab(event.currentTarget.dataset.tab) },
  goCatalog() { this.switchTab('catalog') },
  switchTab(tab) {
    if (!['shop', 'catalog', 'review'].includes(tab)) return
    this.settle()
    this.setData({ tab, zoom: null, detail: null, observation: '', wrongId: '' })
    this.syncView()
    this.persist()
    this.scheduleResultFade()
  },
  onGuess(event) {
    if (this.data.busy || !this._state || this._state.status !== 'awaiting') return
    this.dismissResult()
    const id = event.currentTarget.dataset.id
    const next = engine.guess(this._state, id)
    this.applyState(next)
    this.persist()
    if (next.lastEvent.type === 'wrong') {
      const current = this.entry(engine.currentId(next))
      this.setData({ wrongId: id, observation: current.observationBrief })
      this.refreshReview()
      return
    }
    this.startPlacement(id)
  },
  onHint() {
    if (this.data.busy || !this._state || this._state.status !== 'awaiting') return
    this.dismissResult()
    this.applyState(engine.hint(this._state))
    const current = this.entry(engine.currentId(this._state))
    this.setData({ observation: current.observationBrief })
    this.refreshReview()
    this.persist()
  },
  later(fn, delay, token) {
    this._timers.push(setTimeout(() => { if (token === this._token) fn() }, delay))
  },
  cancelAnimation() {
    this._token += 1
    ;(this._timers || []).forEach(timer => clearTimeout(timer))
    this._timers = []
  },
  startPlacement(id) {
    this.cancelAnimation()
    const token = this._token
    const targetIndex = this._state.drawerIds.indexOf(id)
    const current = this.entry(id)
    this.setData({ busy: true, phase: 'opening', openId: id, wrongId: '', observation: '', zoom: null }, () => {
      if (token !== this._token) return
      // 归位阶段不依赖坐标查询；兼容预览也能完成开屉、收药和合屉。
      this.later(() => this.setData({ phase: 'flying' }), 180, token)
      this.later(() => this.setData({ phase: 'closing', flying: null }), 560, token)
      this.later(() => this.finishPlacement(), 800, token)
      if (typeof wx.createSelectorQuery !== 'function') return
      try {
        const query = wx.createSelectorQuery().in(this)
        query.select('#tray-herb').boundingClientRect()
        query.select('#drawer-' + targetIndex).boundingClientRect()
        query.exec(rects => {
          if (token !== this._token) return
          const from = rects && rects[0]
          const to = rects && rects[1]
          if (!from || !to || !from.width || !to.width) return
          this.setData({ flying: current, flyStyle: 'left:' + from.left + 'px;top:' + from.top + 'px;width:' + from.width + 'px;height:' + from.height + 'px;opacity:1;' })
          this.later(() => {
            const size = Math.min(to.width * 0.62, to.height * 0.6)
            this.setData({ flyStyle: 'left:' + (to.left + (to.width - size) / 2) + 'px;top:' + (to.top + to.height * 0.2) + 'px;width:' + size + 'px;height:' + size + 'px;opacity:0;' })
          }, 180, token)
        })
      } catch (_) {
        // 没有几何查询时，使用同一个抽屉内的收药动画。
      }
    })
    this.later(() => { if (this.data.busy) this.finishPlacement() }, 1100, token)
  },
  finishPlacement() {
    this.cancelAnimation()
    if (this._state && this._state.status === 'placed') {
      this._knowledgeId = engine.currentId(this._state)
      this._state = engine.commit(this._state)
    }
    this.setData({ busy: false, phase: '', openId: '', flying: null, flyStyle: '' })
    this.syncView()
    this.persist()
    this.scheduleResultFade()
  },
  clearResultFade() {
    if (this._resultTimer) clearTimeout(this._resultTimer)
    this._resultTimer = null
  },
  scheduleResultFade() {
    this.clearResultFade()
    // 完成一轮时把最后一句辨认要点留在完成卡片里，不自动淡出。
    if (!this._visible || !this._knowledgeId || this.data.completed ||
        this.data.tab !== 'shop' || this.data.detail || this.data.zoom) return
    const id = this._knowledgeId
    this._resultTimer = setTimeout(() => {
      this._resultTimer = null
      if (this._visible && this.data.tab === 'shop' && !this.data.detail && this._knowledgeId === id) this.dismissResult()
    }, RESULT_FADE_DELAY)
  },
  dismissResult() {
    if (!this._knowledgeId) return
    this._knowledgeId = null
    this.clearResultFade()
    this.setData({ knowledge: null, observation: '', wrongId: '' })
  },
  settle() {
    if (this.data.busy || (this._state && this._state.status === 'placed')) this.finishPlacement()
    else this.cancelAnimation()
    this.clearResultFade()
    this.setData({ zoom: null, busy: false, phase: '', openId: '', flying: null, flyStyle: '' })
  },
  // 旧入口：现在只收起辨认要点，托盘药图在归位结束时已经换好。
  nextHerb() { this.dismissResult() },
  nextRound() {
    if (this.data.busy || !this._state || this._state.status !== 'completed') return
    if (this._state.mode === 'review') {
      this.startReview()
      return
    }
    this.createNormal(this._roundIndex + 1)
    this.syncView()
    this.persist()
  },
  startReview(event) {
    this.settle()
    const focus = event && event.currentTarget && event.currentTarget.dataset.id
    const eligible = new Set(this._pool.map(item => item.id))
    let ids = this._reviewIds.filter(id => eligible.has(id))
    if (this._pool.length < 6 || !ids.length) {
      this.setData({ tab: 'review' })
      return
    }
    ids = shuffle(ids)
    if (focus && ids.includes(focus)) ids = [focus].concat(ids.filter(id => id !== focus))
    ids = ids.slice(0, 6)
    const state = engine.createRound(this._pool, this._roundIndex, ids, this._lastDrawerOrder)
    state.trayIds = differentOrder(state.trayIds, this._lastReviewOrder)
    state.drawerIds = differentOrder(state.drawerIds, this._lastDrawerOrder)
    this._lastReviewOrder = state.trayIds.slice()
    this._lastDrawerOrder = state.drawerIds.slice()
    if (this._state && this._state.mode === 'normal') this._normalState = this._state
    this._state = state
    this._knowledgeId = null
    this.setData({ tab: 'shop', observation: '', wrongId: '', detail: null })
    this.syncView()
    this.persist()
  },
  backToShop() {
    this.settle()
    if (this._normalState) {
      this._state = this._normalState
      this._normalState = null
      this._knowledgeId = null
    } else if (this._pool.length >= 6) this.createNormal(this._roundIndex)
    this.setData({ tab: 'shop', observation: '', wrongId: '' })
    this.syncView()
    this.persist()
  },
  openZoom() {
    if (!this.data.busy && this.data.current && !this._knowledgeId) this.setData({ zoom: this.data.current })
  },
  closeZoom() { this.setData({ zoom: null }) },
  onImageError(event) {
    const id = event.currentTarget.dataset.id
    if (this.data.zoom && this.data.zoom.id === id) this.setData({ 'zoom.image': '' })
    if (this.data.detail && this.data.detail.id === id) this.setData({ 'detail.image': '' })
    if (this.data.current && this.data.current.id === id) this.setData({ 'current.image': '' })
  },
  onSearch(event) { this.searchCatalog(event.detail.value) },
  searchCatalog(query) {
    const needle = String(query || '').trim().toLowerCase()
    const byEngine = new Set(engine.search(CATALOG, needle).map(item => item.id))
    this._results = CATALOG.filter(entry => byEngine.has(entry.id) ||
      (fieldVerified(entry, 'effect') && entry.shortEffectVerified !== false && typeof entry.shortEffect === 'string' && entry.shortEffect.toLowerCase().includes(needle)))
      .sort((a, b) => Number(fieldVerified(b, 'effect')) - Number(fieldVerified(a, 'effect')))
    this._lastScrollLoad = 0
    this.setData({ query, catalogRows: [], loadedCount: 0, catalogTotal: this._results.length, catalogScrollTop: this.data.catalogScrollTop === 0 ? 1 : 0 })
    this.loadMore()
  },
  loadMore() {
    if (!this._results || (this.data.loadedCount >= this._results.length && this.data.loadedCount !== 0)) return
    const end = Math.min(this.data.loadedCount + BATCH, this._results.length)
    const next = this._results.slice(this.data.loadedCount, end).map(entry => {
      const item = display(entry)
      return { id: item.id, name: item.name, shortEffect: item.shortEffect, initial: item.name.slice(0, 1) }
    })
    this.setData({ catalogRows: this.data.catalogRows.concat(next), loadedCount: end, hasMore: end < this._results.length })
  },
  // 部分运行环境不派发 scrolltolower，这里用滚动事件兜底续载。
  onCatalogScroll(event) {
    if (!this.data.hasMore) return
    const detail = (event && event.detail) || {}
    if (typeof detail.scrollTop === 'number' && typeof detail.scrollHeight === 'number') {
      if (detail.scrollHeight - detail.scrollTop > 720) return
    }
    const now = Date.now()
    if (this._lastScrollLoad && now - this._lastScrollLoad < 260) return
    this._lastScrollLoad = now
    this.loadMore()
  },
  openDetail(event) {
    const detail = this.entry(event.currentTarget.dataset.id)
    if (detail) {
      this.clearResultFade()
      this.setData({ detail })
    }
  },
  closeDetail() { this.setData({ detail: null }); this.scheduleResultFade() }
})
