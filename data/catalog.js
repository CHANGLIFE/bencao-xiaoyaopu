const { HERBS } = require('./herbs')
const manifest = require('./catalog.json')
const learningMaterials = require('./learning-materials.json')
const imageMaterials = require('./image-materials.json')

const SAMPLE_TYPES = ['raw-herb', 'decoction-piece']
const IMAGE_TYPES = ['photograph', 'ai-illustration']
const text = value => typeof value === 'string' && value.trim().length > 0
const copy = value => JSON.parse(JSON.stringify(value))
const own = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key)

function validSource(source, type) {
  return !!source && source.type === type && text(source.citation) && text(source.locator)
}

function fieldVerified(entry, field) {
  return !!entry && entry[field + 'Verified'] === true && text(entry[field]) &&
    validSource(entry.sources && entry.sources[field], field === 'image' ? 'image' : 'primary-text')
}

function verifiedShortEffect(entry) {
  return fieldVerified(entry, 'effect') && text(entry.shortEffect) && entry.effect.includes(entry.shortEffect)
    ? entry.shortEffect : ''
}

function imageReady(entry) {
  const provenance = entry && entry.imageProvenance
  return !!entry && fieldVerified(entry, 'image') && IMAGE_TYPES.includes(entry.imageType) &&
    SAMPLE_TYPES.includes(entry.sampleType) && !!provenance &&
    text(provenance.origin) && text(provenance.citation) &&
    (text(provenance.license) || text(provenance.licenseSource)) &&
    provenance.sampleType === entry.sampleType &&
    (!entry.imageSampleType || entry.imageSampleType === entry.sampleType)
}

function isEligible(entry) {
  return !!entry && text(entry.id) && text(entry.name) && entry.enabled === true &&
    fieldVerified(entry, 'effect') && fieldVerified(entry, 'recognition') && imageReady(entry)
}

function toDisplay(entry) {
  return {
    ...entry,
    effect: fieldVerified(entry, 'effect') ? entry.effect : (entry.effectNote || '功效待校对'),
    shortEffect: verifiedShortEffect(entry),
    recognition: fieldVerified(entry, 'recognition') ? entry.recognition : '待补充',
    note: fieldVerified(entry, 'recognition') ? entry.recognition : '待补充',
    observationHint: fieldVerified(entry, 'recognition') ? entry.observationHint || '' : '',
    image: imageReady(entry) ? entry.image : '',
    imageLabel: imageReady(entry) ? entry.imageType === 'ai-illustration' ? 'AI示意图' : '实物照片' : '',
    eligible: isEligible(entry)
  }
}

function emptyLearningMaterial() {
  return {
    enabled: false, effect: '', shortEffect: '', recognition: '', observationHint: '', image: '',
    effectVerified: false, recognitionVerified: false, imageVerified: false,
    sources: { effect: null, recognition: null, image: null },
    imageProvenance: null, imageType: null, sampleType: null,
    processing: { baseId: null, method: null, derivedIds: [], source: null, verified: false, status: '待核验' }
  }
}

function mappedMaterial(materials, entry) {
  const material = own(materials, entry.id) ? materials[entry.id]
    : own(materials, entry.catalogId) ? materials[entry.catalogId] : null
  if (!material) return null
  if ((material.catalogId && material.catalogId !== entry.catalogId) ||
      (material.name && material.name !== entry.name)) {
    throw new TypeError('素材品名或目录ID与条目不符：' + entry.id)
  }
  return copy(material)
}

// 基础616条来自原始品名目录；正文和图片按各自manifest独立合并。
function buildCatalog(externalEntries = [], options = {}) {
  if (!Array.isArray(externalEntries)) throw new TypeError('外部条目必须是数组')
  const learning = options.learningMaterials === undefined ? learningMaterials : options.learningMaterials
  const images = options.imageMaterials === undefined ? imageMaterials : options.imageMaterials
  if (manifest.expectedCount !== 616 || manifest.count !== 616 ||
      !Array.isArray(manifest.entries) || manifest.entries.length !== 616) {
    throw new TypeError('基础品名目录必须严格为616条')
  }
  const legacyById = new Map(HERBS.map(entry => [entry.id, entry]))
  const entries = manifest.entries.map(original => {
    const entry = copy(original)
    const legacy = legacyById.get(entry.legacyGameId)
    if (entry.legacyGameId && !legacy) throw new TypeError('目录包含未知旧ID')
    return {
      ...entry, ...emptyLearningMaterial(),
      id: legacy ? legacy.id : entry.name === '炙甘草' ? 'zhigancao' : entry.id,
      catalogId: entry.id,
      aliases: [...new Set([
        ...(entry.aliases || []), ...(entry.searchAliases || []),
        ...(legacy && legacy.name !== entry.name ? [legacy.name] : [])
      ])],
      ...(legacy ? { legacy: { ...legacy } } : {})
    }
  })
  const ids = new Set(entries.map(entry => entry.id))
  const catalogIds = new Set(entries.map(entry => entry.catalogId))
  const names = new Set(entries.map(entry => entry.name))
  if (ids.size !== 616 || catalogIds.size !== 616 || names.size !== 616 ||
      HERBS.some(legacy => !entries.some(entry => entry.id === legacy.id && entry.legacy))) {
    throw new TypeError('基础目录ID、品名或旧12映射不完整或重复')
  }
  externalEntries.forEach(original => {
    if (!original || !text(original.id) || !text(original.name)) {
      throw new TypeError('外部条目须有唯一ID和药名，不能覆盖旧条目或目录')
    }
    const entry = copy(original)
    const catalogId = entry.catalogId || entry.id
    if (ids.has(entry.id) || catalogIds.has(entry.id) || ids.has(catalogId) ||
        catalogIds.has(catalogId) || names.has(entry.name) ||
        (entry.legacyGameId && ids.has(entry.legacyGameId))) {
      throw new TypeError('外部条目须有唯一ID和药名，不能覆盖旧条目或目录')
    }
    const source = entry.source || (entry.sources && entry.sources.name)
    if (!source || !text(source.citation) || !text(source.locator)) {
      throw new TypeError('外部条目必须提供自己的品名来源citation和locator')
    }
    ids.add(entry.id)
    catalogIds.add(catalogId)
    names.add(entry.name)
    entries.push({
      ...emptyLearningMaterial(), ...entry, catalogId,
      sources: { effect: null, recognition: null, image: null, ...entry.sources },
      aliases: [...new Set([...(entry.aliases || []), ...(entry.searchAliases || [])])]
    })
  })

  entries.forEach(entry => {
    const material = mappedMaterial(learning, entry)
    if (!material) return
    for (const key of ['effect', 'shortEffect', 'recognition', 'observationHint', 'sampleType', 'sampleLabel',
      'appearanceDescription', 'effectVerified', 'recognitionVerified', 'wordTitleVerified', 'nameEvidence']) {
      if (own(material, key)) entry[key] = material[key]
    }
    for (const field of ['effect', 'recognition']) {
      entry.sources[field] = material.sources && material.sources[field] || null
    }
  })

  // 炮制关系只采纳有正文来源的核验记录，不使用catalogParentId推导。
  const relations = learning && learning.metadata && learning.metadata.processingRelations || []
  relations.forEach(relation => {
    if (relation.verified !== true || !validSource(relation.source, 'primary-text')) return
    const from = entries.find(entry => entry.id === relation.fromLegacyId)
    const to = entries.find(entry => entry.catalogId === relation.toCatalogId)
    if (!from || !to) return
    const source = copy(relation.source)
    from.processing = {
      ...from.processing, derivedIds: [...new Set([...from.processing.derivedIds, to.id])],
      source, verified: true, status: '已核验', sourceText: relation.sourceText || ''
    }
    to.processing = {
      ...to.processing, baseId: from.id, method: relation.relation,
      source: copy(source), verified: true, status: '已核验', sourceText: relation.sourceText || ''
    }
    from.relatedNames = [...(from.relatedNames || []), { id: to.id, name: to.name, status: '已核验', source: copy(source), verified: true }]
    to.relatedNames = [...(to.relatedNames || []), { id: from.id, name: from.name, status: '已核验', source: copy(source), verified: true }]
    if (text(relation.effect) && !fieldVerified(to, 'effect')) {
      to.effect = relation.effect
      to.shortEffect = relation.shortEffect || relation.effect.split(/[，。；]/)[0]
      to.effectVerified = true
      to.sources.effect = copy(source)
    }
    if (text(relation.appearanceDescription) && !to.appearanceDescription) to.appearanceDescription = relation.appearanceDescription
  })

  entries.forEach(entry => {
    const image = mappedMaterial(images, entry)
    if (image) {
      for (const key of ['image', 'imageType', 'imageVerified', 'imageProvenance']) {
        entry[key] = own(image, key) ? image[key] : emptyLearningMaterial()[key]
      }
      entry.sources.image = image.sources && image.sources.image || null
      entry.imageSampleType = image.sampleType || null
      // 正文所选样本优先，图片manifest不可悄悄改变学习样本规格。
      if (!entry.sampleType && image.sampleType) entry.sampleType = image.sampleType
      if (entry.imageType === 'ai-illustration' && entry.imageProvenance) {
        if (!text(entry.imageProvenance.license) && !text(entry.imageProvenance.licenseSource)) {
          entry.imageProvenance.license = 'generated-for-project'
        }
        entry.imageProvenance.licenseNote = entry.imageProvenance.licenseNote ||
          '为本项目生成的来源记录，不代表已确认商业版权或法律授权。'
      }
      entry.enabled = image.enabled === true
    } else if (manifest.entries.some(original => original.id === entry.catalogId)) {
      entry.enabled = false
    }
    entry.shortEffect = verifiedShortEffect(entry)
    entry.enabled = isEligible(entry)
  })
  return entries
}

const additionalCatalog = require('./additional-catalog.json')
const pharmacopoeiaText = require('./pharmacopoeia-text.json')

// 官方正文校对库：只补人工精校未覆盖的字段，来源按统一模板构造以节省包体。
function applyOfficialText(entries) {
  const materials = pharmacopoeiaText.items || {}
  const noEffect = {}
  ;(pharmacopoeiaText.unverified || []).forEach(row => { noEffect[row.catalogId] = row })
  const baseUrl = pharmacopoeiaText.urlTemplate || 'https://2025.chp.org.cn/#/item?bookId=1&entryId='
  const edition = pharmacopoeiaText.edition || '2025年版《中华人民共和国药典》一部'
  entries.forEach(entry => {
    const material = own(materials, entry.catalogId) ? materials[entry.catalogId] : null
    if (!material || material.name !== entry.name || !Number.isInteger(material.entryId)) return
    const url = baseUrl + material.entryId
    const citation = edition + ' · ' + entry.name
    const effectOk = text(material.effect) && text(material.shortEffect) &&
      material.effect.includes(material.shortEffect)
    if (!fieldVerified(entry, 'effect') && effectOk) {
      entry.effect = material.effect
      entry.shortEffect = material.shortEffect
      entry.effectVerified = true
      entry.sources.effect = {
        type: 'primary-text', citation,
        locator: url + (material.effectReference
          ? ' + 【功能与主治】同' + material.effectReference + '，功效句引自' + material.effectReference + '词条正文'
          : ' + 【功能与主治】功效句'),
        url
      }
      entry.textVerification = pharmacopoeiaText.verificationMethod
      entry.verificationNote = pharmacopoeiaText.verificationNote
      entry.wordTitleVerified = true
    }
    if (!fieldVerified(entry, 'recognition') && text(material.recognition)) {
      entry.recognition = material.recognition
      entry.recognitionVerified = true
      entry.sources.recognition = {
        type: 'primary-text', citation, locator: url + ' + 【性状】', url
      }
    }
    if (material.titleAlias && !entry.aliases.includes(material.titleAlias)) {
      entry.aliases = entry.aliases.concat(material.titleAlias)
    }
  })
  entries.forEach(entry => {
    // 药典正文确实没有【功能与主治】的条目：明确标注，并附【用途】原文，不改写成功效。
    const note = noEffect[entry.catalogId]
    if (note && !fieldVerified(entry, 'effect')) {
      entry.effectNote = '药典未列功效'
      entry.effectReason = note.reason
      entry.usageText = note.usageText || ''
      const url = baseUrl + note.entryId
      if (entry.usageText) {
        entry.sources.usage = {
          type: 'primary-text', citation: edition + ' · ' + entry.name,
          locator: url + ' + 【用途】（不作功效依据）', url
        }
      }
      // 这两条的【性状】正文是完整的，辨认要点照常校对，只是功效栏没有内容。
      if (note.recognitionText) {
        entry.recognition = note.recognitionText
        entry.recognitionVerified = true
        entry.sources.recognition = {
          type: 'primary-text', citation: edition + ' · ' + entry.name,
          locator: url + ' + 【性状】', url
        }
      }
    }
    entry.shortEffect = verifiedShortEffect(entry)
    entry.enabled = isEligible(entry)
  })
  return entries
}

const CATALOG = applyOfficialText(buildCatalog(additionalCatalog))
module.exports = {
  CATALOG, manifest, buildCatalog, applyOfficialText, toDisplay, isEligible, fieldVerified,
  imageReady, verifiedShortEffect
}
