import * as https from 'node:https'
import {
	combineRgb,
	InstanceBase,
	InstanceStatus,
	runEntrypoint,
	TCPHelper,
	type CompanionActionDefinitions,
	type CompanionFeedbackDefinitions,
	type CompanionPresetDefinitions,
	type SomeCompanionConfigField,
} from '@companion-module/base'

interface Config {
	host: string
	port: number
	username: string
}

type OutputInfo = {
	id: string
	name: string
	mask: number
}

type InputInfo = {
	id: string
	name: string
}

type BinInfo = {
	id: string
	name: string
}

type ExportProfileInfo = {
	id: string
	name: string
}

type PlaylistInfo = {
	id: string
	name: string
	readableId: string
	number: string
}

type SessionInfo = {
	id: string
	name: string
	clipIds: string[]
}

type SessionClipInfo = {
	id: string
	name: string
	timecode: string
}

type HotkeyLookup = {
	readableId: string
	outputIds: string[]
	mask: number | null
	speed: number
	playAfterCue: boolean
}

type TagLookup = {
	readableId: string
	tag: string
	applyToGroup: boolean
}

type SessionPbsLookup = {
	sessionId: string
	readableId: string
	outputIds: string[]
	mask: number | null
	speed: number
	playAfterCue: boolean
}

type OutputStatus = {
	id: string
	name: string
	playmode: number // 0 = SCRUB/PAUSED, 1 = PLAYING (per API docs)
	playspeed: number // speed percentage, 0-100
	clip_time_remaining: string
	playlist_time_remaining: string
	playlist_id: string
	timecode: string
	date: string
	clip_id: string
}

class DC extends InstanceBase<Config, undefined> {
	private tcp?: TCPHelper
	private requestId = 1
	private pending = new Map<number, string>()
	private pendingHotkeys = new Map<number, HotkeyLookup>()
	private pendingTags = new Map<number, TagLookup>()
	private pendingSessionClipRefresh = new Map<number, string>()
	private pendingSessionPbs = new Map<number, SessionPbsLookup>()

	private outputs: OutputInfo[] = []
	private inputs: InputInfo[] = []
	private bins: BinInfo[] = []
	private exportProfiles: ExportProfileInfo[] = []
	private playlists: PlaylistInfo[] = []
	private sessionPlaylists: PlaylistInfo[] = []
	private sessions: SessionInfo[] = []
	private sessionClips: SessionClipInfo[] = []
	private allClips: { id: string; name: string }[] = []
	private outputStatuses = new Map<string, OutputStatus>()
	private clipNames = new Map<string, string>()
	private clipReadableIds = new Map<string, string>()  // clip_id -> readable_id
	private playlistNames = new Map<string, string>()
	private statusPollInterval?: ReturnType<typeof setInterval>
	private systemInfoPollInterval?: ReturnType<typeof setInterval>
	private storageInfo: { timeRemainingSeconds?: number; raw?: any } = {}
	private nasInfo: { mounts: { path: string; name: string; connected: boolean }[]; raw?: any } = { mounts: [] }
	private lastPingMs: number | null = null
	private lastPingTime: number = 0

	private lastClipId = ''
	private lastClipName = ''
	private selectedClipId = ''
	private selectedClipName = ''
	private selectedClipTags: string[] = []

	private configData: Config = {
		host: '10.16.8.100',
		port: 5001,
		username: 'Operator',
	}

	public async init(config: Config): Promise<void> {
		this.setConfig(config)
		this.updateStatus(InstanceStatus.Connecting)
		this.setActionDefinitions(this.getActions())
		this.setFeedbackDefinitions(this.getFeedbacks())
		this.setPresetDefinitions(this.getPresets())
		this.connect()
	}

	public async destroy(): Promise<void> {
		this.stopPlayspeedPolling()
		this.stopSystemInfoPolling()
		this.tcp?.destroy()
		this.tcp = undefined
	}

	public async configUpdated(config: Config): Promise<void> {
		this.setConfig(config)
		this.stopPlayspeedPolling()
		this.stopSystemInfoPolling()
		this.tcp?.destroy()
		this.outputs = []
		this.inputs = []
		this.bins = []
		this.exportProfiles = []
		this.playlists = []
		this.sessionPlaylists = []
		this.sessions = []
		this.sessionClips = []
		this.allClips = []
		this.outputStatuses = new Map()
		this.setActionDefinitions(this.getActions())
		this.setFeedbackDefinitions(this.getFeedbacks())
		this.setPresetDefinitions(this.getPresets())
		this.connect()
	}

	private setConfig(config: Partial<Config>): void {
		this.configData = {
			host: config.host || '10.16.8.100',
			port: config.port || 5001,
			username: config.username || 'Operator',
		}
	}

	public getConfigFields(): SomeCompanionConfigField[] {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'DreamCatcher IP',
				width: 8,
				default: '10.16.8.100',
			},
			{
				type: 'number',
				id: 'port',
				label: 'Port',
				width: 4,
				default: 5001,
				min: 1,
				max: 65535,
			},
			{
				type: 'textinput',
				id: 'username',
				label: 'DreamCatcher Username',
				width: 6,
				default: 'Operator',
			},
		]
	}

	private connect(): void {
		this.log('info', `Connecting to DreamCatcher ${this.configData.host}:${this.configData.port}`)
		this.updateStatus(InstanceStatus.Connecting)

		this.tcp = new TCPHelper(this.configData.host, this.configData.port, { reconnect: true })

		this.tcp.on('connect', () => {
			this.log('info', 'Connected to DreamCatcher')
			this.updateStatus(InstanceStatus.Ok)
			this.login()

			setTimeout(() => {
				this.refreshOutputs()
				this.refreshInputs()
				this.refreshExportProfiles()
				this.refreshAllPlaylists()
				this.refreshAllClips()
				this.send('subscribe_output_status', null)
				this.startPlayspeedPolling()
				this.startSystemInfoPolling()
			}, 250)
		})

		this.tcp.on('error', (e) => {
			this.log('error', String(e))
			this.updateStatus(InstanceStatus.ConnectionFailure)
		})

		this.tcp.on('data', (data: Buffer) => {
			const text = data.toString()
			this.log('debug', `RX ${text.trim()}`)

			for (const line of text.split('\n')) {
				const trimmed = line.trim()
				if (!trimmed) continue

				try {
					const msg = JSON.parse(trimmed)
					this.handleResponse(msg)
				} catch {
					this.log('debug', `Could not parse response: ${trimmed}`)
				}
			}
		})
	}

	private handleResponse(msg: any): void {
		const id = Number(msg.id)
		const method = this.pending.get(id)

		// DreamCatcher pushes output status as {"jsonrpc":"2.0","method":"output_status","params":{...}}
		// params is a single object, not an array
		if (msg.method === 'output_status' && msg.params && typeof msg.params === 'object') {
			this.handleOutputStatusUpdate([msg.params])
		}

		// get_output_status polled response — result is an array of output status objects
		if (method === 'get_output_status' && Array.isArray(msg.result)) {
			this.handleOutputStatusUpdate(msg.result)
		}

		if (method === 'find_local_playlists' || method === 'find_playlists' || method === 'get_playlists') {
			this.log('info', `Playlist response from ${method}: ${JSON.stringify(msg.result)}`)
		}

		if (method === 'get_outputs' && Array.isArray(msg.result)) {
			this.outputs = msg.result
				.map((o: any, index: number) => ({
					id: String(o.id || ''),
					name: String(o.name || `Output ${index + 1}`),
					mask: Math.pow(2, index),
				}))
				.filter((o: OutputInfo) => o.id.length > 0)

			this.log('info', `Discovered ${this.outputs.length} DreamCatcher outputs`)
			this.refreshDefinitions()
		}

		if (method === 'find_session_clip_pbs') {
			this.handleSessionPbsClipLookup(id, msg.result)
		}

		if (method === 'find_clips_hotkey') {
			this.handleHotkeyClipLookup(id, msg.result)
		}

		if (method === 'find_clips_tag') {
			this.handleTagClipLookup(id, msg.result)
		}

		if (method === 'get_input_sources') {
			const rawInputs = this.extractArray(msg.result)
			this.inputs = rawInputs
				.map((i: any, index: number) => ({
					id: String(i.id || i.input_id || i.uuid || ''),
					name: String(i.name || i.eng_name || i.label || i.title || `Input ${index + 1}`),
				}))
				.filter((i: InputInfo) => i.id.length > 0)

			this.log('info', `Discovered ${this.inputs.length} DreamCatcher input sources`)
			this.refreshDefinitions()
		}

		if (method === 'find_bins' || method === 'get_bins') {
			const rawBins = this.extractArray(msg.result)
			this.bins = rawBins
				.map((b: any, index: number) => ({
					id: String(b.bin_id || b.id || b.uuid || ''),
					name: String(b.name || b.label || b.title || `Bin ${index + 1}`),
				}))
				.filter((b: BinInfo) => b.id.length > 0)

			this.log('info', `Discovered ${this.bins.length} DreamCatcher bins`)
			this.refreshDefinitions()
		}

		if (method === 'get_export_profiles' || method === 'find_export_profiles') {
			const rawProfiles = this.extractArray(msg.result)
			this.exportProfiles = rawProfiles
				.map((p: any, index: number) => ({
					id: String(p.id || p.profile_id || p.uuid || p.name || ''),
					name: String(p.name || p.label || p.title || p.id || `Profile ${index + 1}`),
				}))
				.filter((p: ExportProfileInfo) => p.id.length > 0)

			this.log('info', `Discovered ${this.exportProfiles.length} export profiles`)
			this.refreshDefinitions()
		}

		if (method === 'find_playlists' || method === 'get_playlists' || method === 'find_local_playlists') {
			const rawPlaylists = this.extractArray(msg.result)
			this.playlists = rawPlaylists
				.map((p: any) => this.normalizePlaylist(p))
				.filter((p: PlaylistInfo) => p.id.length > 0)

			this.log('info', `Discovered ${this.playlists.length} DreamCatcher playlists`)
			this.refreshDefinitions()
		}

		if (method === 'get_sessions' && Array.isArray(msg.result)) {
			this.sessions = msg.result
				.map((s: any, index: number) => ({
					id: String(s.session_id || s.id || s.uuid || ''),
					name: String(s.name || s.label || s.title || `Session ${index + 1}`),
					clipIds: Array.isArray(s.session_clips) ? s.session_clips.map((clipId: any) => String(clipId)) : [],
				}))
				.filter((s: SessionInfo) => s.id.length > 0)

			this.sessionClips = []
			this.log('info', `Discovered ${this.sessions.length} DreamCatcher sessions`)
			this.refreshDefinitions()
		}

		if (method === 'refresh_session_clips') {
			const sessionId = this.pendingSessionClipRefresh.get(id)
			const session = this.sessions.find((s) => s.id === sessionId)

			if (!session) {
				this.log('warn', 'Session clip refresh completed, but selected session was not found')
				this.pendingSessionClipRefresh.delete(id)
				return
			}

			this.sessionClips = session.clipIds.map((clipId, index) => ({
				id: clipId,
				name: `${session.name} Clip ${index + 1}`,
				timecode: '',
			}))

			this.log('info', `Loaded ${this.sessionClips.length} clips from session ${session.name}`)
			this.pendingSessionClipRefresh.delete(id)
			this.refreshDefinitions()
		}

		if (method === 'create_clip' && Array.isArray(msg.result)) {
			const clip = msg.result[0]

			if (clip?.clip_id) {
				this.lastClipId = String(clip.clip_id)
				this.lastClipName = String(clip.name || 'Last Clip')
				this.setSelectedClip(this.lastClipId, this.lastClipName)
				this.log('info', `Stored last clip: ${this.lastClipName} / ${this.lastClipId}`)
			}
		}

		if (msg.id !== undefined) {
			this.pending.delete(id)
		}
	}

	private setSelectedClip(clipId: string, clipName: string): void {
		this.selectedClipId = clipId
		this.selectedClipName = clipName

		this.log('info', `Selected clip set to ${clipName} / ${clipId}`)
	}

	private handleHotkeyClipLookup(requestId: number, result: any): void {
		const request = this.pendingHotkeys.get(requestId)
		if (!request) return

		const clips = this.extractArray(result)
		const clip = clips[0]

		if (!clip?.clip_id) {
			this.log('warn', `No clip found for ${request.readableId}`)
			this.pendingHotkeys.delete(requestId)
			return
		}

		const clipId = String(clip.clip_id)
		const clipName = String(clip.name || clip.dynamic_name || request.readableId)

		this.log('info', `Found ${request.readableId}: ${clipName} / ${clipId}`)
		this.clipNames.set(clipId, clipName)
		this.setSelectedClip(clipId, clipName)

		this.send('cue_clip', {
			clip_id: clipId,
			outputs: request.outputIds,
			speed: request.speed,
		})

		if (request.playAfterCue) {
			if (request.mask !== null) {
				this.selectOutputs(request.mask)
			}

			this.send('set_playspeed', { speed: 100 })
		}

		this.pendingHotkeys.delete(requestId)
	}

	private handleTagClipLookup(requestId: number, result: any): void {
		const request = this.pendingTags.get(requestId)
		if (!request) return

		const clips = this.extractArray(result)
		const clip = clips[0]

		if (!clip?.clip_id) {
			this.log('warn', `No clip found for ${request.readableId}`)
			this.pendingTags.delete(requestId)
			return
		}

		const clipId = String(clip.clip_id)
		const clipName = String(clip.name || clip.dynamic_name || request.readableId)

		this.log('info', `Adding tag "${request.tag}" to ${request.readableId}: ${clipName} / ${clipId}`)

		this.send('add_tags', {
			clip_ids: [clipId],
			apply_to_group: request.applyToGroup,
			tags: [request.tag],
		})

		this.pendingTags.delete(requestId)
	}

	private cleanTimeString(value: any): string {
		return String(value ?? '').replace(/\u0000/g, '').trim()
	}

	private startPlayspeedPolling(): void {
		this.stopPlayspeedPolling()
		this.statusPollInterval = setInterval(() => {
			this.send('get_output_status', null)
		}, 500)
	}

	private stopPlayspeedPolling(): void {
		if (this.statusPollInterval !== undefined) {
			clearInterval(this.statusPollInterval)
			this.statusPollInterval = undefined
		}
	}

	private startSystemInfoPolling(): void {
		this.stopSystemInfoPolling()
		this.pollSystemInfo()
		this.systemInfoPollInterval = setInterval(() => this.pollSystemInfo(), 5000)
	}

	private stopSystemInfoPolling(): void {
		if (this.systemInfoPollInterval !== undefined) {
			clearInterval(this.systemInfoPollInterval)
			this.systemInfoPollInterval = undefined
		}
	}

	private pollSystemInfo(): void {
		// Ping — measure round trip of a lightweight call
		const pingStart = Date.now()
		this.lastPingTime = pingStart
		this.httpJsonRpc('get_storage_info', null, (result) => {
			const elapsed = Date.now() - pingStart
			this.lastPingMs = elapsed

			// Parse storage info — data is nested under result.storage
			if (result && typeof result === 'object') {
				const storage = result.storage ?? result
				const timeRemaining = storage.real_time_remaining ?? storage.time_remaining ?? null
				this.storageInfo = {
					timeRemainingSeconds: timeRemaining !== null ? Number(timeRemaining) : undefined,
					raw: storage,
				}
			}

			this.checkFeedbacks('ping', 'storage_info', 'nas_info', 'timecode_display')
		})

		// NAS info — separate call
		this.httpJsonRpc('nas_info', null, (result) => {
			if (result && typeof result === 'object') {
				const prevCount = this.nasInfo.mounts.length
				this.nasInfo = {
					mounts: Object.entries(result).map(([path, info]: [string, any]) => ({
						path,
						name: String(info.folder_name || path),
						connected: Boolean(info.connected),
					})),
					raw: result,
				}
				// Rebuild feedback definitions if mounts changed so dropdown updates
				if (prevCount !== this.nasInfo.mounts.length) {
					this.refreshDefinitions()
				}
			}
			this.checkFeedbacks('nas_info')
		})

		// Ping timeout — if ping hasn't returned in 2s, mark as failed
		setTimeout(() => {
			if (this.lastPingTime === pingStart && this.lastPingMs === null) {
				this.lastPingMs = -1
				this.checkFeedbacks('ping')
			}
		}, 2000)
	}

	private fetchClipName(clipId: string): void {
		// Prevent duplicate in-flight fetches
		this.clipNames.set(clipId, '?')

		this.httpJsonRpc('get_clip', { clip_id: clipId }, (result) => {
			if (!result) return
			const name = String(result.name || result.dynamic_name || '')
			if (name) {
				this.clipNames.set(clipId, name)
				this.checkFeedbacks('output_playing', 'output_playing_simple')
				this.log('debug', `Fetched clip name: ${clipId} -> ${name}`)
			}
		})
	}

	private fetchPlaylistName(playlistId: string): void {
		// Prevent duplicate in-flight fetches
		this.playlistNames.set(playlistId, '?')

		this.httpJsonRpc('find_local_playlists', { playlist_id: playlistId }, (result) => {
			const playlists = this.extractArray(result)
			const pl = playlists[0]
			if (!pl) return

			const name = String(pl.name || pl.readable_id || pl.readableId || '')
			if (name) {
				this.playlistNames.set(playlistId, name)
				this.checkFeedbacks('output_playing', 'output_playing_simple')
				this.log('debug', `Fetched playlist name: ${playlistId} -> ${name}`)
			}
		})
	}

	private handleOutputStatusUpdate(statuses: any[]): void {
		let changed = false

		for (const s of statuses) {
			const outputId = String(s.id || '')
			if (!outputId) continue

			const existing = this.outputStatuses.get(outputId)
			const updated: OutputStatus = {
				id: outputId,
				name: String(s.name || s.eng_name || existing?.name || ''),
				playmode: Number(s.playmode ?? existing?.playmode ?? 0),
				playspeed: Number(s.playspeed ?? existing?.playspeed ?? 0),
				clip_time_remaining: this.cleanTimeString(s.clip_time_remaining ?? existing?.clip_time_remaining),
				playlist_time_remaining: this.cleanTimeString(s.playlist_time_remaining ?? existing?.playlist_time_remaining),
				// Use null check not || so empty string / null clears the value
				playlist_id: s.playlist_id != null ? String(s.playlist_id) : '',
				timecode: this.cleanTimeString(s.timecode ?? existing?.timecode),
				date: String(s.date || existing?.date || ''),
				clip_id: s.clip_id != null ? String(s.clip_id) : (existing?.clip_id ?? ''),
			}

			this.outputStatuses.set(outputId, updated)
			changed = true
		}

		if (changed) {
			this.checkFeedbacks('output_playing', 'output_playing_simple')
		}
	}

	private refreshDefinitions(): void {
		this.setActionDefinitions(this.getActions())
		this.setFeedbackDefinitions(this.getFeedbacks())
		this.setPresetDefinitions(this.getPresets())
	}

	private extractArray(value: any): any[] {
		if (Array.isArray(value)) return value
		if (Array.isArray(value?.clips)) return value.clips
		if (Array.isArray(value?.playlists)) return value.playlists
		if (Array.isArray(value?.playlist)) return value.playlist
		if (Array.isArray(value?.local_playlists)) return value.local_playlists
		if (Array.isArray(value?.localPlaylists)) return value.localPlaylists
		if (Array.isArray(value?.results)) return value.results
		if (Array.isArray(value?.items)) return value.items
		if (Array.isArray(value?.objects)) return value.objects
		if (Array.isArray(value?.data)) return value.data

		if (value && typeof value === 'object') {
			for (const key of Object.keys(value)) {
				if (Array.isArray(value[key])) return value[key]
			}
		}

		return []
	}

	private normalizePlaylist(p: any): PlaylistInfo {
		const id = String(p.package_id || p.playlist_id || p.id || p.uuid || '')
		const name = String(p.name || p.label || p.title || p.readable_id || p.readableId || id)
		const readableId = String(p.readable_id || p.readableId || p.number || '')
		const number = this.parsePlaylistNumber(`${readableId} ${name}`)

		return { id, name, readableId, number }
	}

	private parsePlaylistNumber(source: string): string {
		const match = source.match(/(?:PLAYLIST|PL|LIST)?[\s._-]*(\d{1,6})/i)
		return match ? match[1] : ''
	}

	private angleToNumber(angle: string): number {
		const letter = angle.trim().toUpperCase()
		const code = letter.charCodeAt(0)
		if (code < 65 || code > 90) return 1
		return code - 64
	}

	private buildReadableId(page: string, bank: string, slot: string, angle: string): string {
		const angleNumber = this.angleToNumber(angle)
		return `${this.configData.username}.${page.trim()}.${bank.trim()}.${slot.trim()}.${angleNumber}`
	}

	private findPlaylistByNumber(number: string): PlaylistInfo | undefined {
		const wanted = number.trim()
		return this.playlists.find((playlist) => playlist.number === wanted || playlist.readableId === wanted)
	}

	private resolvePlaylistIdentifier(
		dropdownPlaylistId: string,
		readableId: string,
	): { playlist_id?: string; readable_id?: string } | null {
		const manualReadableId = readableId.trim()
		if (manualReadableId) return { readable_id: manualReadableId }

		const playlistId = dropdownPlaylistId.trim()
		if (!playlistId) return null

		return { playlist_id: playlistId }
	}

	private clipNameTemplateChoices() {
		return [
			{ id: '%C_%L_%i_%o', label: 'Camera + Location + In/Out' },
			{ id: '%C_%i_%o', label: 'Camera + In/Out' },
			{ id: '%C_%L_%d', label: 'Camera + Location + Duration' },
			{ id: '%C_%d', label: 'Camera + Duration' },
			{ id: '%t_%C_%d', label: 'Created Time + Camera + Duration' },
			{ id: '%t_%C', label: 'Created Time + Camera' },
			{ id: '%u_%C_%i', label: 'Clip ID + Camera + In Timecode' },
			{ id: '%u_%C', label: 'Clip ID + Camera' },
		]
	}

	private angleChoices() {
		return [
			{ id: 'A', label: 'A / Angle 1' },
			{ id: 'B', label: 'B / Angle 2' },
			{ id: 'C', label: 'C / Angle 3' },
			{ id: 'D', label: 'D / Angle 4' },
			{ id: 'E', label: 'E / Angle 5' },
			{ id: 'F', label: 'F / Angle 6' },
			{ id: 'G', label: 'G / Angle 7' },
			{ id: 'H', label: 'H / Angle 8' },
		]
	}

	private inputChoices() {
		if (this.inputs.length === 0) {
			return [{ id: '', label: 'No inputs discovered - run Refresh Inputs' }]
		}

		return this.inputs.map((i) => ({ id: i.id, label: i.name }))
	}

	private defaultInputId(): string {
		return this.inputs[0]?.id || ''
	}

	private binChoices() {
		if (this.bins.length === 0) {
			return [{ id: '', label: 'No bins discovered - run Refresh Bins' }]
		}

		return this.bins.map((b) => ({ id: b.id, label: b.name }))
	}

	private defaultBinId(): string {
		return this.bins[0]?.id || ''
	}

	private exportProfileChoices() {
		if (this.exportProfiles.length === 0) {
			return [{ id: 'default', label: 'Default' }]
		}

		return this.exportProfiles.map((p) => ({ id: p.id, label: p.name }))
	}

	private defaultExportProfileId(): string {
		return this.exportProfiles[0]?.id || 'default'
	}

	private playlistChoices() {
		if (this.playlists.length === 0) {
			return [{ id: '', label: 'No playlists — run Refresh Playlists' }]
		}

		return this.playlists.map((p) => ({ id: p.id, label: p.name || p.readableId || p.id }))
	}

	private sessionPlaylistChoices() {
		if (this.sessionPlaylists.length === 0) {
			return [{ id: '', label: 'No session playlists — run Refresh Session Playlists' }]
		}

		return this.sessionPlaylists.map((p) => ({ id: p.id, label: p.name || p.readableId || p.id }))
	}

	private defaultPlaylistId(): string {
		return this.playlists[0]?.id || ''
	}

	private sessionChoices() {
		if (this.sessions.length === 0) {
			return [{ id: '', label: 'No sessions discovered - run Refresh Sessions' }]
		}

		return this.sessions.map((s) => ({ id: s.id, label: s.name }))
	}

	private defaultSessionId(): string {
		return this.sessions[0]?.id || ''
	}

	private sessionClipChoices() {
		if (this.sessionClips.length === 0) {
			return [{ id: '', label: 'No session clips loaded - run Refresh Session Clips' }]
		}

		return this.sessionClips.map((clip) => ({ id: clip.id, label: clip.name }))
	}

	private allClipChoices() {
		if (this.allClips.length === 0) {
			return [{ id: '', label: 'No clips loaded — run Refresh All Clips' }]
		}

		return this.allClips.map((c) => ({ id: c.id, label: c.name }))
	}

	private defaultSessionClipId(): string {
		return this.sessionClips[0]?.id || ''
	}

	private refreshSessionClips(sessionId: string): void {
		if (!sessionId) {
			this.log('warn', 'No session selected/discovered')
			return
		}

		const session = this.sessions.find((s) => s.id === sessionId)
		if (!session) {
			this.log('warn', 'Selected session was not found. Run Refresh Sessions first.')
			return
		}

		this.httpJsonRpc('find_clips', { session_id: sessionId, limit: 500 }, (clipsResult) => {
			const rawClips = this.extractArray(clipsResult)

			this.sessionClips = rawClips
				.filter((clip: any) => {
					// Keep real clips and avoid input/source train stubs.
					if (clip.placeholder === true) return false
					if (clip.primary === false) return false
					if (clip.clip_id && clip.clip_id === clip.record_train_id) return false
					if (clip.name && /^Input\d+$/i.test(String(clip.name))) return false
					return true
				})
				.map((clip: any, index: number) => {
					const clipId = String(clip.clip_id || clip.id || clip.uuid || '')
					const clipName = String(clip.name || clip.dynamic_name || clip.readable_id || `Clip ${index + 1}`)
					const timecode = String(clip.short_in?.timecode || clip.orig_short_in?.timecode || '')
					const readableId = String(clip.readable_id || '')

					// Store clip_id -> readable_id and clip_id -> name for feedback display
					if (clipId && readableId) {
						this.clipReadableIds.set(clipId, readableId)
					}
					if (clipId && clipName) {
						this.clipNames.set(clipId, clipName)
					}

					let label = clipName
					if (readableId) label += ` | ${readableId}`
					if (timecode) label += ` | ${timecode}`

					return {
						id: clipId,
						name: label,
						timecode,
					}
				})
				.filter((clip: SessionClipInfo) => clip.id.length > 0)

			this.log('info', `Loaded ${this.sessionClips.length} real clips from session ${session.name}`)
			this.refreshDefinitions()
		})
	}

	private outputChoices() {
		if (this.outputs.length === 0) {
			return [{ id: '', label: 'No outputs discovered - run Refresh Outputs' }]
		}

		return this.outputs.map((o) => ({ id: o.id, label: o.name }))
	}

	private outputComboChoices() {
		const choices = [...this.outputChoices()]

		if (this.outputs.length >= 2) {
			choices.push({ id: '__FIRST_TWO__', label: `${this.outputs[0].name} + ${this.outputs[1].name}` })
			choices.push({ id: '__ALL__', label: 'All Outputs' })
		}

		return choices
	}

	private defaultOutputId(): string {
		return this.outputs[0]?.id || ''
	}

	private getSelectedMask(outputId: string): number | null {
		if (outputId === '__ALL__') return this.outputs.reduce((mask, output) => mask + output.mask, 0)
		if (outputId === '__FIRST_TWO__') return this.outputs.slice(0, 2).reduce((mask, output) => mask + output.mask, 0)

		const output = this.outputs.find((o) => o.id === outputId)
		return output ? output.mask : null
	}

	private getSelectedOutputIds(outputId: string): string[] {
		if (outputId === '__ALL__') return this.outputs.map((o) => o.id)
		if (outputId === '__FIRST_TWO__') return this.outputs.slice(0, 2).map((o) => o.id)
		return outputId ? [outputId] : []
	}

	private handleSessionPbsClipLookup(requestId: number, result: any): void {
		const request = this.pendingSessionPbs.get(requestId)
		if (!request) return

		const clips = this.extractArray(result)
		const clip = clips.find((c: any) => String(c.readable_id || '') === request.readableId) || clips[0]

		if (!clip?.clip_id) {
			this.log('warn', `No clip found in selected session for ${request.readableId}`)
			this.pendingSessionPbs.delete(requestId)
			return
		}

		const clipId = String(clip.clip_id)
		const clipName = String(clip.name || clip.dynamic_name || request.readableId)

		this.log('info', `Found session clip ${request.readableId}: ${clipName} / ${clipId}`)
		this.clipNames.set(clipId, clipName)
		this.setSelectedClip(clipId, clipName)

		this.send('cue_clip', {
			clip_id: clipId,
			outputs: request.outputIds,
			speed: request.speed,
		})

		if (request.playAfterCue) {
			if (request.mask !== null) {
				this.selectOutputs(request.mask)
			}

			setTimeout(() => this.send('set_playspeed', { speed: 100 }), 150)
		}

		this.pendingSessionPbs.delete(requestId)
	}

	private requestSessionPbsClipLookup(
		sessionId: string,
		readableId: string,
		outputIds: string[],
		mask: number | null,
		speed: number,
		playAfterCue: boolean,
	): void {
		const id = this.requestId++

		const msg: any = {
			jsonrpc: '2.0',
			method: 'find_clips',
			params: {
				session_id: sessionId,
				readable_id: readableId,
				limit: 10,
			},
			id,
		}

		this.pending.set(id, 'find_session_clip_pbs')
		this.pendingSessionPbs.set(id, {
			sessionId,
			readableId,
			outputIds,
			mask,
			speed,
			playAfterCue,
		})

		const payload = JSON.stringify(msg) + '\r\n'
		this.log('debug', `TX ${payload.trim()}`)
		this.tcp?.send(payload)
	}

	private requestClipHotkeyLookup(
		readableId: string,
		outputIds: string[],
		mask: number | null,
		speed: number,
		playAfterCue: boolean,
	): void {
		const id = this.requestId++

		const msg: any = {
			jsonrpc: '2.0',
			method: 'find_clips',
			params: {
				readable_id: readableId,
				limit: 1,
			},
			id,
		}

		this.pending.set(id, 'find_clips_hotkey')
		this.pendingHotkeys.set(id, {
			readableId,
			outputIds,
			mask,
			speed,
			playAfterCue,
		})

		const payload = JSON.stringify(msg) + '\r\n'
		this.log('debug', `TX ${payload.trim()}`)
		this.tcp?.send(payload)
	}

	private requestTagClipLookup(readableId: string, tag: string, applyToGroup: boolean): void {
		if (!this.tcp?.isConnected) {
			this.log('warn', 'Not connected, cannot look up clip for tagging')
			return
		}

		const id = this.requestId++

		const msg: any = {
			jsonrpc: '2.0',
			method: 'find_clips',
			params: {
				readable_id: readableId,
				limit: 1,
			},
			id,
		}

		this.pending.set(id, 'find_clips_tag')
		this.pendingTags.set(id, {
			readableId,
			tag,
			applyToGroup,
		})

		const payload = JSON.stringify(msg) + '\r\n'
		this.log('debug', `TX ${payload.trim()}`)
		this.tcp.send(payload)
	}

	private getActions(): CompanionActionDefinitions {
		return {
			refresh_outputs: {
				name: 'Refresh Outputs',
				options: [],
				callback: async () => this.refreshOutputs(),
			},

			refresh_inputs: {
				name: 'Refresh Inputs',
				options: [],
				callback: async () => this.refreshInputs(),
			},

			refresh_bins: {
				name: 'Refresh Bins',
				options: [],
				callback: async () => this.refreshBins(),
			},

			refresh_export_profiles: {
				name: 'Refresh Export Profiles',
				options: [],
				callback: async () => this.refreshExportProfiles(),
			},

			refresh_connection: {
				name: 'Refresh Connection',
				options: [
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session for Clip Names',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
				],
				callback: async (event) => {
					this.refreshConnection(String(event.options.session || ''))
				},
			},

			route_input_to_output: {
				name: 'Route Input to Output',
				options: [
					{
						type: 'dropdown',
						id: 'input',
						label: 'Input',
						choices: this.inputChoices(),
						default: this.defaultInputId(),
					},
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const inputId = String(event.options.input || '')
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))

					if (!inputId) return this.log('warn', 'No input selected/discovered')
					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')

					this.send('cue_clip', { clip_id: inputId, outputs: outputIds, speed: 100 })
				},
			},

			refresh_sessions: {
				name: 'Refresh Sessions',
				options: [],
				callback: async () => this.refreshSessions(),
			},

			refresh_all_clips: {
				name: 'Refresh All Clips',
				options: [],
				callback: async () => this.refreshAllClips(),
			},

			refresh_playlists: {
				name: 'Refresh Playlists',
				options: [
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session (for session playlists, optional)',
						choices: [{ id: '', label: 'None' }, ...this.sessionChoices()],
						default: '',
					},
				],
				callback: async (event) => {
					this.refreshAllPlaylists(String(event.options.session || '') || undefined)
				},
			},

			cue_session_playlist_dropdown: {
				name: 'Cue Session Playlist Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
					{
						type: 'dropdown',
						id: 'playlist_id',
						label: 'Playlist',
						choices: this.sessionPlaylistChoices(),
						default: this.sessionPlaylists[0]?.id || '',
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const mask = this.getSelectedMask(outputId)
					const playlistId = String(event.options.playlist_id || '')

					if (mask === null) return this.log('warn', 'No output selected/discovered')
					if (!playlistId) return this.log('warn', 'No playlist selected — run Refresh Session Playlists first')

					this.selectOutputs(mask)
					this.send('cue_playlist', { package_id: playlistId })
				},
			},

			play_session_playlist_dropdown: {
				name: 'Play Session Playlist Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
					{
						type: 'dropdown',
						id: 'playlist_id',
						label: 'Playlist',
						choices: this.sessionPlaylistChoices(),
						default: this.sessionPlaylists[0]?.id || '',
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const mask = this.getSelectedMask(outputId)
					const playlistId = String(event.options.playlist_id || '')

					if (mask === null) return this.log('warn', 'No output selected/discovered')
					if (!playlistId) return this.log('warn', 'No playlist selected — run Refresh Session Playlists first')

					this.selectOutputs(mask)
					this.send('cue_playlist', { package_id: playlistId })

					setTimeout(() => {
						this.selectOutputs(mask)
						this.send('set_playspeed', { speed: 100 })
					}, 150)
				},
			},

			cue_by_clip_name: {
				name: 'Cue Clip Name Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'clip_id',
						label: 'Clip',
						choices: this.allClipChoices(),
						default: this.allClips[0]?.id || '',
					},
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const clipId = String(event.options.clip_id || '')

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					if (!clipId) return this.log('warn', 'No clip selected — run Refresh All Clips first')

					this.send('cue_clip', { clip_id: clipId, outputs: outputIds, speed: 0 })
				},
			},

			play_by_clip_name: {
				name: 'Play Clip Name Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'clip_id',
						label: 'Clip',
						choices: this.allClipChoices(),
						default: this.allClips[0]?.id || '',
					},
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const mask = this.getSelectedMask(String(event.options.output || ''))
					const clipId = String(event.options.clip_id || '')

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					if (!clipId) return this.log('warn', 'No clip selected — run Refresh All Clips first')

					this.send('cue_clip', { clip_id: clipId, outputs: outputIds, speed: 0 })

					if (mask !== null) {
						setTimeout(() => {
							this.selectOutputs(mask)
							this.send('set_playspeed', { speed: 100 })
						}, 150)
					}
				},
			},

			cue_playlist_dropdown: {
				name: 'Cue Playlist Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'playlist_id',
						label: 'Playlist',
						choices: this.playlistChoices(),
						default: this.defaultPlaylistId(),
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const mask = this.getSelectedMask(outputId)
					const playlistId = String(event.options.playlist_id || '')

					if (mask === null) return this.log('warn', 'No output selected/discovered')
					if (!playlistId) return this.log('warn', 'No playlist selected — run Refresh Playlists first')

					this.selectOutputs(mask)
					this.send('cue_playlist', { package_id: playlistId })
				},
			},

			play_playlist_dropdown: {
				name: 'Play Playlist Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'playlist_id',
						label: 'Playlist',
						choices: this.playlistChoices(),
						default: this.defaultPlaylistId(),
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const mask = this.getSelectedMask(outputId)
					const playlistId = String(event.options.playlist_id || '')

					if (mask === null) return this.log('warn', 'No output selected/discovered')
					if (!playlistId) return this.log('warn', 'No playlist selected — run Refresh Playlists first')

					this.selectOutputs(mask)
					this.send('cue_playlist', { package_id: playlistId })

					setTimeout(() => {
						this.selectOutputs(mask)
						this.send('set_playspeed', { speed: 100 })
					}, 150)
				},
			},

			cue_session_clip_dropdown: {
				name: 'Cue Session Clip Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
					{
						type: 'dropdown',
						id: 'clip_id',
						label: 'Clip',
						choices: this.sessionClipChoices(),
						default: this.defaultSessionClipId(),
					},
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const clipId = String(event.options.clip_id || '')

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					if (!clipId) return this.log('warn', 'No clip selected — run Refresh Session Clips first')

					this.send('cue_clip', { clip_id: clipId, outputs: outputIds, speed: 0 })
				},
			},

			play_session_clip_dropdown: {
				name: 'Play Session Clip Dropdown',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
					{
						type: 'dropdown',
						id: 'clip_id',
						label: 'Clip',
						choices: this.sessionClipChoices(),
						default: this.defaultSessionClipId(),
					},
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const mask = this.getSelectedMask(String(event.options.output || ''))
					const clipId = String(event.options.clip_id || '')

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					if (!clipId) return this.log('warn', 'No clip selected — run Refresh Session Clips first')

					this.send('cue_clip', { clip_id: clipId, outputs: outputIds, speed: 0 })

					if (mask !== null) {
						setTimeout(() => {
							this.selectOutputs(mask)
							this.send('set_playspeed', { speed: 100 })
						}, 150)
					}
				},
			},

			refresh_session_clips: {
				name: 'Refresh Session Clips',
				options: [
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
				],
				callback: async (event) => {
					this.refreshSessionClips(String(event.options.session || ''))
				},
			},

			cue_session_clip_by_pbs: {
				name: 'Cue Session Clip by PBS',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
					{ type: 'number', id: 'page', label: 'Page', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'bank', label: 'Bank', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'slot', label: 'Slot', default: 1, min: 0, max: 999 },
					{ type: 'dropdown', id: 'angle', label: 'Angle', default: 'A', choices: this.angleChoices() },
					{ type: 'number', id: 'speed', label: 'Cue Speed', default: 0, min: -400, max: 400 },
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const mask = this.getSelectedMask(String(event.options.output || ''))
					const sessionId = String(event.options.session || '')

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					if (!sessionId) return this.log('warn', 'No session selected. Run Refresh Sessions first.')

					const readableId = this.buildReadableId(
						String(event.options.page || 1),
						String(event.options.bank || 1),
						String(event.options.slot || 1),
						String(event.options.angle || 'A'),
					)

					this.log('info', `Looking up session clip ${readableId}`)
					this.requestSessionPbsClipLookup(
						sessionId,
						readableId,
						outputIds,
						mask,
						Number(event.options.speed || 0),
						false,
					)
				},
			},

			play_session_clip_by_pbs: {
				name: 'Play Session Clip by PBS',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'session',
						label: 'Session',
						choices: this.sessionChoices(),
						default: this.defaultSessionId(),
					},
					{ type: 'number', id: 'page', label: 'Page', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'bank', label: 'Bank', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'slot', label: 'Slot', default: 1, min: 0, max: 999 },
					{ type: 'dropdown', id: 'angle', label: 'Angle', default: 'A', choices: this.angleChoices() },
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const mask = this.getSelectedMask(String(event.options.output || ''))
					const sessionId = String(event.options.session || '')

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					if (!sessionId) return this.log('warn', 'No session selected. Run Refresh Sessions first.')

					const readableId = this.buildReadableId(
						String(event.options.page || 1),
						String(event.options.bank || 1),
						String(event.options.slot || 1),
						String(event.options.angle || 'A'),
					)

					this.log('info', `Looking up session clip ${readableId}`)
					this.requestSessionPbsClipLookup(sessionId, readableId, outputIds, mask, 0, true)
				},
			},

			cue_clip_by_page_bank_slot_angle: {
				name: 'Cue Clip by Page / Bank / Slot / Angle',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{ type: 'number', id: 'page', label: 'Page', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'bank', label: 'Bank', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'slot', label: 'Slot', default: 1, min: 0, max: 999 },
					{ type: 'dropdown', id: 'angle', label: 'Angle', default: 'A', choices: this.angleChoices() },
					{ type: 'number', id: 'speed', label: 'Cue Speed', default: 0, min: -400, max: 400 },
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const mask = this.getSelectedMask(String(event.options.output || ''))

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')

					const readableId = this.buildReadableId(
						String(event.options.page || 1),
						String(event.options.bank || 1),
						String(event.options.slot || 1),
						String(event.options.angle || 'A'),
					)

					this.log('info', `Looking up clip ${readableId}`)
					this.requestClipHotkeyLookup(readableId, outputIds, mask, Number(event.options.speed || 0), false)
				},
			},

			play_clip_by_page_bank_slot_angle: {
				name: 'Play Clip by Page / Bank / Slot / Angle',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{ type: 'number', id: 'page', label: 'Page', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'bank', label: 'Bank', default: 1, min: 0, max: 999 },
					{ type: 'number', id: 'slot', label: 'Slot', default: 1, min: 0, max: 999 },
					{ type: 'dropdown', id: 'angle', label: 'Angle', default: 'A', choices: this.angleChoices() },
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					const mask = this.getSelectedMask(String(event.options.output || ''))

					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')

					const readableId = this.buildReadableId(
						String(event.options.page || 1),
						String(event.options.bank || 1),
						String(event.options.slot || 1),
						String(event.options.angle || 'A'),
					)

					this.log('info', `Looking up clip ${readableId}`)
					this.requestClipHotkeyLookup(readableId, outputIds, mask, 0, true)
				},
			},

			play: {
				name: 'Play',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{ type: 'number', id: 'speed', label: 'Speed', default: 100, min: -400, max: 400 },
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('set_playspeed', { speed: Number(event.options.speed || 100) })
				},
			},

			pause: {
				name: 'Pause',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('set_playspeed', { speed: 0 })
				},
			},

			scrub: {
				name: 'Scrub',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{ type: 'number', id: 'frames', label: 'Frames', default: 30, min: -9999, max: 9999 },
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('scrub', { scrub: Number(event.options.frames || 0) })
				},
			},

			scrub_encoder: {
				name: 'Scrub (Encoder / Knob)',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'number',
						id: 'frames_per_tick',
						label: 'Frames per tick (negative = backwards)',
						default: 1,
						min: -100,
						max: 100,
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					const framesPerTick = Number(event.options.frames_per_tick || 1)
					if (framesPerTick === 0) return

					this.selectOutputs(mask)
					this.send('scrub', { scrub: framesPerTick })
				},
			},

			scrub_encoder_back: {
				name: 'Scrub Back (Encoder / Knob)',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'number',
						id: 'frames_per_tick',
						label: 'Frames per tick (negative = backwards)',
						default: -1,
						min: -100,
						max: 100,
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					const framesPerTick = Number(event.options.frames_per_tick || -1)
					if (framesPerTick === 0) return

					this.selectOutputs(mask)
					this.send('scrub', { scrub: framesPerTick })
				},
			},

			playspeed_encoder_up: {
				name: 'Playspeed Up (Encoder / Knob)',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'number',
						id: 'step',
						label: 'Speed step per tick (%)',
						default: 10,
						min: 1,
						max: 100,
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const mask = this.getSelectedMask(outputId)
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					const step = Number(event.options.step || 10)
					const ids = this.getSelectedOutputIds(outputId)
					const current = ids.length === 1
						? (this.outputStatuses.get(ids[0])?.playspeed ?? 0)
						: 0
					const newSpeed = Math.min(100, current + step)

					this.selectOutputs(mask)
					this.send('set_playspeed', { speed: newSpeed })
				},
			},

			playspeed_encoder_down: {
				name: 'Playspeed Down (Encoder / Knob)',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'number',
						id: 'step',
						label: 'Speed step per tick (%)',
						default: 10,
						min: 1,
						max: 100,
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const mask = this.getSelectedMask(outputId)
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					const step = Number(event.options.step || 10)
					const ids = this.getSelectedOutputIds(outputId)
					const current = ids.length === 1
						? (this.outputStatuses.get(ids[0])?.playspeed ?? 0)
						: 0
					const newSpeed = Math.max(0, current - step)

					this.selectOutputs(mask)
					this.send('set_playspeed', { speed: newSpeed })
				},
			},

			goto_live: {
				name: 'Goto Live',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('goto_live_capture', {})
				},
			},

			goto_in: {
				name: 'Goto In',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('goto_mark', { name: 'in' })
				},
			},

			goto_out: {
				name: 'Goto Out',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('goto_mark', { name: 'out' })
				},
			},

			mark_in: {
				name: 'Mark In',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.login()
					this.selectOutputs(mask)
					this.send('mark_in', {})
				},
			},

			mark_out: {
				name: 'Mark Out',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.login()
					this.selectOutputs(mask)
					this.send('mark_out', {})
				},
			},

			create_meta_mark: {
				name: 'Create Meta Mark',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output (for timecode position)',
						choices: this.outputChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'textinput',
						id: 'name',
						label: 'Mark Name',
						default: 'Mark',
					},
				],
				callback: async (event) => {
					const outputId = String(event.options.output || '')
					const markName = String(event.options.name || 'Mark')
					const status = this.outputStatuses.get(outputId)

					if (!status) return this.log('warn', 'No output status available — wait for connection')
					if (!status.timecode) return this.log('warn', 'No timecode available for this output')
					if (!status.date) return this.log('warn', 'No date available for this output')

					// Strip sub-frame portion (e.g. "17:06:42.33.0" -> "17:06:42.33")
					const timecode = status.timecode.replace(/(\.\d+)\.\d+$/, '$1')

					// Send over TCP so the creator matches the logged-in username
					this.login()
					this.send('create_meta_mark', {
						name: markName,
						position: {
							date: status.date,
							timecode,
						},
					})
				},
			},

			create_clip: {
				name: 'Create Clip',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'name',
						label: 'Clip Name Template',
						default: '%C_%L_%i_%o',
						choices: this.clipNameTemplateChoices(),
					},
					{ type: 'textinput', id: 'readable_id', label: 'Readable ID Optional', default: '' },
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					this.login()
					this.selectOutputs(mask)

					const params: any = { name: String(event.options.name || '%C_%L_%i_%o') }
					const readableId = String(event.options.readable_id || '').trim()
					if (readableId) params.readable_id = readableId

					this.send('create_clip', params)
				},
			},

			recall_last_clip: {
				name: 'Recall Last Clip',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{ type: 'number', id: 'speed', label: 'Cue Speed', default: 0, min: -400, max: 400 },
				],
				callback: async (event) => {
					if (!this.lastClipId) return this.log('warn', 'No last clip stored yet')
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					this.setSelectedClip(this.lastClipId, this.lastClipName || 'Last Clip')
					this.send('cue_clip', {
						clip_id: this.lastClipId,
						outputs: outputIds,
						speed: Number(event.options.speed || 0),
					})
				},
			},

			set_output_idle: {
				name: 'Set Output Idle / Black',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const outputIds = this.getSelectedOutputIds(String(event.options.output || ''))
					if (outputIds.length === 0) return this.log('warn', 'No output selected/discovered')
					this.send('set_output_idle', { outputs: outputIds })
				},
			},

			restart_components: {
				name: 'Restart System Components',
				options: [
					{ type: 'checkbox', id: 'inputs', label: 'Restart Inputs', default: false },
					{ type: 'checkbox', id: 'outputs', label: 'Restart Outputs', default: false },
					{ type: 'checkbox', id: 'amps', label: 'Restart AMP Connections', default: false },
					{ type: 'checkbox', id: 'vue', label: 'Restart VUE', default: false },
					{ type: 'checkbox', id: 'confirm', label: 'Confirm Restart', default: false },
				],
				callback: async (event) => {
					if (!event.options.confirm) {
						this.log('warn', 'Restart not sent. Check Confirm Restart first.')
						return
					}

					const params: any = {}
					if (event.options.inputs) params.inputs = true
					if (event.options.outputs) params.outputs = true
					if (event.options.amps) params.amps = true
					if (event.options.vue) params.vue = true

					if (Object.keys(params).length === 0) {
						this.log('warn', 'No restart components selected.')
						return
					}

					this.send('restart_system', params)
				},
			},

			reboot_server: {
				name: 'Reboot Server',
				options: [],
				callback: async () => this.send('reboot_server', {}),
			},

			set_mosaic_custom_layout: {
				name: 'Set Custom Mosaic Layout',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'dropdown',
						id: 'box_count',
						label: 'Number of Boxes',
						default: '4',
						choices: [
							{ id: '2', label: '2 Boxes' },
							{ id: '3', label: '3 Boxes' },
							{ id: '4', label: '4 Boxes' },
						],
					},
					{ type: 'number', id: 'border_thickness', label: 'Border Thickness', default: 0, min: 0, max: 64 },
					{ type: 'textinput', id: 'border_colour', label: 'Border Colour', default: '#000000' },

					{
						type: 'dropdown',
						id: 'box1_id',
						label: 'Box 1 Input',
						choices: this.inputChoices(),
						default: this.defaultInputId(),
					},
					{ type: 'number', id: 'box1_region_x', label: 'Box 1 Region X', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box1_region_y', label: 'Box 1 Region Y', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box1_region_w', label: 'Box 1 Region Width', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box1_region_h', label: 'Box 1 Region Height', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box1_location_x', label: 'Box 1 Location X', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box1_location_y', label: 'Box 1 Location Y', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box1_location_w', label: 'Box 1 Location Width', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box1_location_h', label: 'Box 1 Location Height', default: 0.5, min: 0, max: 1 },

					{
						type: 'dropdown',
						id: 'box2_id',
						label: 'Box 2 Input',
						choices: this.inputChoices(),
						default: this.defaultInputId(),
					},
					{ type: 'number', id: 'box2_region_x', label: 'Box 2 Region X', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box2_region_y', label: 'Box 2 Region Y', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box2_region_w', label: 'Box 2 Region Width', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box2_region_h', label: 'Box 2 Region Height', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box2_location_x', label: 'Box 2 Location X', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box2_location_y', label: 'Box 2 Location Y', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box2_location_w', label: 'Box 2 Location Width', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box2_location_h', label: 'Box 2 Location Height', default: 0.5, min: 0, max: 1 },

					{
						type: 'dropdown',
						id: 'box3_id',
						label: 'Box 3 Input',
						choices: this.inputChoices(),
						default: this.defaultInputId(),
					},
					{ type: 'number', id: 'box3_region_x', label: 'Box 3 Region X', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box3_region_y', label: 'Box 3 Region Y', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box3_region_w', label: 'Box 3 Region Width', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box3_region_h', label: 'Box 3 Region Height', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box3_location_x', label: 'Box 3 Location X', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box3_location_y', label: 'Box 3 Location Y', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box3_location_w', label: 'Box 3 Location Width', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box3_location_h', label: 'Box 3 Location Height', default: 0.5, min: 0, max: 1 },

					{
						type: 'dropdown',
						id: 'box4_id',
						label: 'Box 4 Input',
						choices: this.inputChoices(),
						default: this.defaultInputId(),
					},
					{ type: 'number', id: 'box4_region_x', label: 'Box 4 Region X', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box4_region_y', label: 'Box 4 Region Y', default: 0, min: 0, max: 1 },
					{ type: 'number', id: 'box4_region_w', label: 'Box 4 Region Width', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box4_region_h', label: 'Box 4 Region Height', default: 1, min: 0, max: 1 },
					{ type: 'number', id: 'box4_location_x', label: 'Box 4 Location X', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box4_location_y', label: 'Box 4 Location Y', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box4_location_w', label: 'Box 4 Location Width', default: 0.5, min: 0, max: 1 },
					{ type: 'number', id: 'box4_location_h', label: 'Box 4 Location Height', default: 0.5, min: 0, max: 1 },
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					const boxCount = Number(event.options.box_count || 4)
					const angles: any[] = []

					for (let i = 1; i <= boxCount; i++) {
						const inputId = String(event.options[`box${i}_id`] || '')
						if (!inputId) {
							this.log('warn', `Box ${i} has no input selected`)
							return
						}

						angles.push({
							id: inputId,
							region: {
								x: Number(event.options[`box${i}_region_x`] ?? 0),
								y: Number(event.options[`box${i}_region_y`] ?? 0),
								width: Number(event.options[`box${i}_region_w`] ?? 1),
								height: Number(event.options[`box${i}_region_h`] ?? 1),
							},
							location: {
								x: Number(event.options[`box${i}_location_x`] ?? 0),
								y: Number(event.options[`box${i}_location_y`] ?? 0),
								width: Number(event.options[`box${i}_location_w`] ?? 0.5),
								height: Number(event.options[`box${i}_location_h`] ?? 0.5),
							},
						})
					}

					this.selectOutputs(mask)

					setTimeout(() => {
						const payload = {
							layout: 'custom',
							border_thickness: Number(event.options.border_thickness || 0),
							border_colour: String(event.options.border_colour || '#000000'),
							angles,
						}

						this.log('info', `Sending custom mosaic: ${JSON.stringify(payload)}`)
						this.send('set_mosaic_layout', payload)
					}, 150)
				},
			},

			clear_mosaic_layout: {
				name: 'Clear Mosaic Layout',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')

					this.selectOutputs(mask)
					this.send('clear_mosaic_layout', {})
				},
			},

			start_capture: {
				name: 'Start Capture',
				options: [],
				callback: async () => {
					this.send('start_capture', {})
				},
			},

			stop_capture: {
				name: 'Stop Capture',
				options: [],
				callback: async () => {
					this.send('stop_capture', {})
				},
			},

			raw_jsonrpc: {
				name: 'Raw JSON-RPC',
				options: [
					{ type: 'textinput', id: 'method', label: 'Method', default: 'get_outputs' },
					{ type: 'textinput', id: 'params', label: 'Params JSON object, blank for none', default: '' },
				],
				callback: async (event) => {
					const method = String(event.options.method || '').trim()
					const paramsText = String(event.options.params || '').trim()
					let params: any = null

					if (paramsText) {
						try {
							params = JSON.parse(paramsText)
						} catch (e) {
							this.log('error', `Invalid params JSON: ${String(e)}`)
							return
						}
					}

					this.send(method, params)
				},
			},

			restart_collectd: {
				name: 'Restart Database (restart_collectd)',
				options: [],
				callback: async () => {
					this.send('restart_collectd', null)
				},
			},

			skip_next_clip: {
				name: 'Skip Next Clip',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('skip_next_clip', null)
				},
			},

			next_clip: {
				name: 'Next Clip',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputComboChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: async (event) => {
					const mask = this.getSelectedMask(String(event.options.output || ''))
					if (mask === null) return this.log('warn', 'No output selected/discovered')
					this.selectOutputs(mask)
					this.send('next_clip', null)
				},
			},
		}
	}

	private getFeedbacks(): CompanionFeedbackDefinitions {
		return {
			ping: {
				type: 'advanced',
				name: 'Ping — Connection Status',
				description: 'Green when DreamCatcher responds within 2s, red if no response.',
				options: [],
				callback: () => {
					if (this.lastPingMs === null) {
						return { bgcolor: combineRgb(80, 80, 80), text: 'PING\n--' }
					}
					if (this.lastPingMs < 0) {
						return { bgcolor: combineRgb(160, 0, 0), text: 'PING\nTIMEOUT' }
					}
					return {
						bgcolor: combineRgb(0, 150, 0),
						text: `PING\n${this.lastPingMs}ms`,
					}
				},
			},

			storage_info: {
				type: 'advanced',
				name: 'Record Time Remaining',
				description: 'Shows recording time remaining from get_storage_info. Green = plenty, yellow = low, red = critical.',
				options: [
					{
						type: 'number',
						id: 'warn_minutes',
						label: 'Warning threshold (minutes remaining)',
						default: 60,
						min: 1,
						max: 9999,
					},
					{
						type: 'number',
						id: 'crit_minutes',
						label: 'Critical threshold (minutes remaining)',
						default: 15,
						min: 1,
						max: 9999,
					},
				],
				callback: (feedback) => {
					const secs = this.storageInfo.timeRemainingSeconds
					if (secs === undefined) {
						return { bgcolor: combineRgb(80, 80, 80), text: 'REC TIME\n--' }
					}

					const warn = Number(feedback.options.warn_minutes ?? 60) * 60
					const crit = Number(feedback.options.crit_minutes ?? 15) * 60

					let bgcolor: number
					if (secs <= crit) {
						bgcolor = combineRgb(160, 0, 0)
					} else if (secs <= warn) {
						bgcolor = combineRgb(180, 150, 0)
					} else {
						bgcolor = combineRgb(0, 100, 0)
					}

					const h = Math.floor(secs / 3600)
					const m = Math.floor((secs % 3600) / 60)
					const s = Math.floor(secs % 60)
					const timeStr = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

					return {
						bgcolor,
						text: `REC TIME\n${timeStr}`,
					}
				},
			},

			nas_info: {
				type: 'advanced',
				name: 'NAS Status',
				description: 'Shows connected/disconnected status for a specific NAS mount.',
				options: [
					{
						type: 'dropdown',
						id: 'mount',
						label: 'NAS Mount',
						choices: this.nasInfo.mounts.length > 0
							? this.nasInfo.mounts.map((m) => ({ id: m.path, label: m.name }))
							: [{ id: '', label: 'No mounts — wait for poll' }],
						default: this.nasInfo.mounts[0]?.path || '',
					},
				],
				callback: (feedback) => {
					const mountPath = String(feedback.options.mount || '')
					const mount = this.nasInfo.mounts.find((m) => m.path === mountPath)

					if (!mount) {
						return { bgcolor: combineRgb(80, 80, 80), text: 'NAS\n--' }
					}

					return {
						bgcolor: mount.connected ? combineRgb(0, 150, 0) : combineRgb(160, 0, 0),
						text: `${mount.name}\n${mount.connected ? 'CONNECTED' : 'OFFLINE'}`,
					}
				},
			},

			timecode_display: {
				type: 'advanced',
				name: 'Timecode Display — System Time',
				description: 'Shows the current system timecode from the first Montage output.',
				options: [],
				callback: () => {
					// Use the first MontageOutput for system time
					const montageOutput = this.outputs.find((o) =>
						o.name.toLowerCase().includes('montage')
					) || this.outputs[0]

					const status = montageOutput ? this.outputStatuses.get(montageOutput.id) : undefined
					const tc = status?.timecode?.replace(/\..*$/, '') || '--:--:--'

					return {
						bgcolor: combineRgb(0, 0, 80),
						text: `SYSTEM TIME\n${tc}`,
					}
				},
			},

			output_playing_simple: {
				type: 'advanced',
				name: 'Output Playing — Simple Green/Yellow/Red',
				description: 'Green at 100%, yellow at 1-99%, red at 0%. Shows output name and speed.',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputChoices(),
						default: this.defaultOutputId(),
					},
					{
						type: 'colorpicker',
						id: 'color_playing',
						label: 'Colour at 100% (full speed)',
						default: combineRgb(0, 150, 0),
					},
					{
						type: 'colorpicker',
						id: 'color_slow',
						label: 'Colour at 1–99% (slow/varispeed)',
						default: combineRgb(180, 150, 0),
					},
					{
						type: 'colorpicker',
						id: 'color_stopped',
						label: 'Colour at 0% (stopped/paused)',
						default: combineRgb(160, 0, 0),
					},
				],
				callback: (feedback) => {
					const outputId = String(feedback.options.output || '')
					const status = this.outputStatuses.get(outputId)

					if (!status) return {}

					const outputName = status.name
						|| this.outputs.find((o) => o.id === outputId)?.name
						|| 'OUTPUT'

					let bgcolor: number
					if (status.playspeed === 100) {
						bgcolor = Number(feedback.options.color_playing)
					} else if (status.playspeed > 0) {
						bgcolor = Number(feedback.options.color_slow)
					} else {
						bgcolor = Number(feedback.options.color_stopped)
					}

					return {
						bgcolor,
						text: `${outputName}\n${status.playspeed}%`,
					}
				},
			},

			output_playing: {
				type: 'advanced',
				name: 'Output Status — Name + Time Remaining',
				description: 'Shows the output name and clip/playlist time remaining. Green = playing, Yellow = paused/0%, Red = nothing playing.',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						label: 'Output',
						choices: this.outputChoices(),
						default: this.defaultOutputId(),
					},
				],
				callback: (feedback) => {
					const outputId = String(feedback.options.output || '')
					const status = this.outputStatuses.get(outputId)

					// No status yet — don't override button text at all
					if (!status) {
						return {}
					}

					const outputName = status?.name
						|| this.outputs.find((o) => o.id === outputId)?.name
						|| 'OUTPUT'

					const timecode = status.timecode.replace(/^(00:)+/, '') || '--:--'

					// Live input — clip_id matches a known input UUID
					const isLive = !!status.clip_id && this.inputs.some((i) => i.id === status.clip_id)
					if (isLive) {
						const rawName = this.inputs.find((i) => i.id === status.clip_id)?.name || 'LIVE'
						const inputName = rawName.length > 15 ? rawName.slice(0, 15) : rawName
						return {
							bgcolor: combineRgb(0, 75, 160),
							text: `${outputName}\n${inputName}\n${timecode}`,
						}
					}

					// Idle — no clip, just show red with no text override
					if (!status.clip_id) {
						return {
							bgcolor: combineRgb(160, 0, 0),
						}
					}

					// If we don't have the clip name yet, fetch it on demand
					if (!this.clipNames.has(status.clip_id)) {
						this.fetchClipName(status.clip_id)
					}

					// Playlist or clip
					const isPlaylist = !!status.playlist_id
					const rawTime = isPlaylist ? status.playlist_time_remaining : status.clip_time_remaining
					const cleanTime = rawTime.replace(/^(00:)+/, '').replace(/^0+(?=\d)/, '')
					const time = cleanTime && cleanTime !== '0' && cleanTime !== '.00'
						? cleanTime
						: timecode

					let identifier: string
					if (isPlaylist) {
						if (!this.playlistNames.has(status.playlist_id)) {
							this.fetchPlaylistName(status.playlist_id)
						}
						const name = this.playlistNames.get(status.playlist_id) || '?'
						identifier = name.length > 15 ? name.slice(0, 15) : name
					} else {
						const rawName = this.clipNames.get(status.clip_id)
						const name = rawName || '?'
						identifier = name.length > 15 ? name.slice(0, 15) : name
					}

					// 100% = green, 1-99% = yellow, 0% = red
					let bgcolor: number
					if (status.playspeed === 100) {
						bgcolor = combineRgb(0, 150, 0)
					} else if (status.playspeed > 0) {
						bgcolor = combineRgb(180, 150, 0)
					} else {
						bgcolor = combineRgb(160, 0, 0)
					}

					return {
						bgcolor,
						text: `${outputName}\n${identifier}\n${time}`,
					}
				},
			},
		}
	}

	private getPresets(): CompanionPresetDefinitions {
		const out1 = this.defaultOutputId()
		const firstTwo = '__FIRST_TWO__'
		const allOutputs = '__ALL__'

		return {
			restart_all_components: {
				type: 'button',
				category: 'System Restart',
				name: 'Restart Inputs, Outputs, AMP, and VUE',
				style: { text: 'RESTART\nALL', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(160, 0, 0) },
				steps: [
					{
						down: [
							{
								actionId: 'restart_components',
								options: { inputs: true, outputs: true, amps: true, vue: true, confirm: true },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			reboot_server: {
				type: 'button',
				category: 'System Restart',
				name: 'Reboot Server',
				style: { text: 'REBOOT\nSERVER', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(180, 0, 0) },
				steps: [{ down: [{ actionId: 'reboot_server', options: {} }], up: [] }],
				feedbacks: [],
			},

			restart_inputs: {
				type: 'button',
				category: 'System Restart',
				name: 'Restart Inputs',
				style: {
					text: 'RESTART\nINPUTS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(130, 70, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'restart_components',
								options: { inputs: true, outputs: false, amps: false, vue: false, confirm: true },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			restart_outputs: {
				type: 'button',
				category: 'System Restart',
				name: 'Restart Outputs',
				style: {
					text: 'RESTART\nOUTPUTS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(130, 70, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'restart_components',
								options: { inputs: false, outputs: true, amps: false, vue: false, confirm: true },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			restart_amps: {
				type: 'button',
				category: 'System Restart',
				name: 'Restart AMP Connections',
				style: { text: 'RESTART\nAMP', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(130, 70, 0) },
				steps: [
					{
						down: [
							{
								actionId: 'restart_components',
								options: { inputs: false, outputs: false, amps: true, vue: false, confirm: true },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			restart_vue: {
				type: 'button',
				category: 'System Restart',
				name: 'Restart VUE',
				style: { text: 'RESTART\nVUE', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(130, 70, 0) },
				steps: [
					{
						down: [
							{
								actionId: 'restart_components',
								options: { inputs: false, outputs: false, amps: false, vue: true, confirm: true },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			refresh_outputs: {
				type: 'button',
				category: 'System',
				name: 'Refresh Outputs',
				style: {
					text: 'REFRESH\nOUTPUTS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [{ down: [{ actionId: 'refresh_outputs', options: {} }], up: [] }],
				feedbacks: [],
			},

			refresh_inputs: {
				type: 'button',
				category: 'System',
				name: 'Refresh Inputs',
				style: {
					text: 'REFRESH\nINPUTS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [{ down: [{ actionId: 'refresh_inputs', options: {} }], up: [] }],
				feedbacks: [],
			},

			refresh_bins: {
				type: 'button',
				category: 'System',
				name: 'Refresh Bins',
				style: { text: 'REFRESH\nBINS', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(50, 50, 50) },
				steps: [{ down: [{ actionId: 'refresh_bins', options: {} }], up: [] }],
				feedbacks: [],
			},

			refresh_export_profiles: {
				type: 'button',
				category: 'System',
				name: 'Refresh Export Profiles',
				style: {
					text: 'REFRESH\nEXPORTS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [{ down: [{ actionId: 'refresh_export_profiles', options: {} }], up: [] }],
				feedbacks: [],
			},

			restart_collectd_preset: {
				type: 'button',
				category: 'System Restart',
				name: 'Restart Database',
				style: { text: 'RESTART\nDATABASE', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(140, 60, 0) },
				steps: [{ down: [{ actionId: 'restart_collectd', options: {} }], up: [] }],
				feedbacks: [],
			},

			ping_monitor: {
				type: 'button',
				category: 'System',
				name: 'Ping Monitor',
				style: { text: 'PING\n--', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [], up: [] }],
				feedbacks: [{ feedbackId: 'ping', options: {} }],
			},

			storage_monitor: {
				type: 'button',
				category: 'System',
				name: 'Record Time Remaining',
				style: { text: 'REC TIME\n--', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [], up: [] }],
				feedbacks: [{ feedbackId: 'storage_info', options: { warn_minutes: 60, crit_minutes: 15 } }],
			},

			nas_monitor: {
				type: 'button',
				category: 'System',
				name: 'NAS Monitor',
				style: { text: 'NAS\n--', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [], up: [] }],
				feedbacks: [{ feedbackId: 'nas_info', options: {} }],
			},

			timecode_monitor: {
				type: 'button',
				category: 'System',
				name: 'Timecode Display',
				style: { text: 'SYSTEM TIME\n--:--:--', size: '24', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 0, 80) },
				steps: [{ down: [], up: [] }],
				feedbacks: [{ feedbackId: 'timecode_display', options: {} }],
			},

			next_clip_preset: {
				type: 'button',
				category: 'Output Control',
				name: 'Next Clip',
				style: { text: 'NEXT\nCLIP', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 80, 120) },
				steps: [{ down: [{ actionId: 'next_clip', options: { output: this.defaultOutputId() } }], up: [] }],
				feedbacks: [],
			},

			skip_next_clip_preset: {
				type: 'button',
				category: 'Output Control',
				name: 'Skip Next Clip',
				style: { text: 'SKIP\nNEXT', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(120, 60, 0) },
				steps: [{ down: [{ actionId: 'skip_next_clip', options: { output: this.defaultOutputId() } }], up: [] }],
				feedbacks: [],
			},

			start_capture: {
				type: 'button',
				category: 'Capture Control',
				name: 'Start Capture',
				style: { text: 'START\nCAPTURE', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 120, 0) },
				steps: [{ down: [{ actionId: 'start_capture', options: {} }], up: [] }],
				feedbacks: [],
			},

			stop_capture: {
				type: 'button',
				category: 'Capture Control',
				name: 'Stop Capture',
				style: { text: 'STOP\nCAPTURE', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(160, 0, 0) },
				steps: [{ down: [{ actionId: 'stop_capture', options: {} }], up: [] }],
				feedbacks: [],
			},

			refresh_connection_preset: {
				type: 'button',
				category: 'System',
				name: 'Refresh Connection',
				style: {
					text: 'REFRESH\nCONNECTION',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(30, 70, 130),
				},
				steps: [{ down: [{ actionId: 'refresh_connection', options: { session: this.defaultSessionId() } }], up: [] }],
				feedbacks: [],
			},

			play_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Play Output 1',
				style: { text: 'PLAY\nOUT 1', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(160, 0, 0) },
				steps: [{ down: [{ actionId: 'play', options: { output: out1, speed: 100 } }], up: [] }],
				feedbacks: [
					{
						feedbackId: 'output_playing_simple',
						options: {
							output: out1,
							color_playing: combineRgb(0, 150, 0),
							color_slow: combineRgb(180, 150, 0),
							color_stopped: combineRgb(160, 0, 0),
						},
					},
				],
			},

			pause_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Pause Output 1',
				style: { text: 'PAUSE\nOUT 1', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(160, 110, 0) },
				steps: [{ down: [{ actionId: 'pause', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			scrub_back_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Scrub Back Output 1',
				style: { text: 'SCRUB\n-30', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [{ actionId: 'scrub', options: { output: out1, frames: -30 } }], up: [] }],
				feedbacks: [],
			},

			scrub_forward_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Scrub Forward Output 1',
				style: { text: 'SCRUB\n+30', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [{ actionId: 'scrub', options: { output: out1, frames: 30 } }], up: [] }],
				feedbacks: [],
			},

			scrub_encoder_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Scrub Encoder Output 1',
				style: { text: 'SCRUB\nKNOB', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				options: { rotaryActions: true },
				steps: [
					{
						down: [],
						up: [],
						rotate_left: [{ actionId: 'scrub_encoder_back', options: { output: out1, frames_per_tick: -5 } }],
						rotate_right: [{ actionId: 'scrub_encoder', options: { output: out1, frames_per_tick: 5 } }],
					},
				],
				feedbacks: [],
			},

			playspeed_encoder_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Playspeed Encoder Output 1',
				style: { text: 'SPEED\nKNOB', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				options: { rotaryActions: true },
				steps: [
					{
						down: [{ actionId: 'play', options: { output: out1, speed: 100 } }],
						up: [],
						rotate_left: [{ actionId: 'playspeed_encoder_down', options: { output: out1, step: 10 } }],
						rotate_right: [{ actionId: 'playspeed_encoder_up', options: { output: out1, step: 10 } }],
					},
				],
				feedbacks: [
					{
						feedbackId: 'output_playing_simple',
						options: {
							output: out1,
							color_playing: combineRgb(0, 150, 0),
							color_slow: combineRgb(180, 150, 0),
							color_stopped: combineRgb(160, 0, 0),
						},
					},
				],
			},

			live_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Goto Live Output 1',
				style: { text: 'LIVE\nOUT 1', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 75, 160) },
				steps: [{ down: [{ actionId: 'goto_live', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			goto_in: {
				type: 'button',
				category: 'Output Control',
				name: 'Goto In',
				style: { text: 'GOTO\nIN', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(70, 70, 140) },
				steps: [{ down: [{ actionId: 'goto_in', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			goto_out: {
				type: 'button',
				category: 'Output Control',
				name: 'Goto Out',
				style: { text: 'GOTO\nOUT', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(140, 70, 70) },
				steps: [{ down: [{ actionId: 'goto_out', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			// Output Control + Feedback — single preset with full status feedback
			output_status_feedback: {
				type: 'button',
				category: 'Output Control + Feedback',
				name: 'Output Status',
				style: { text: 'OUTPUT\nSTATUS', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 120, 0) },
				steps: [{ down: [{ actionId: 'play', options: { output: out1, speed: 100 } }], up: [] }],
				feedbacks: [
					{
						feedbackId: 'output_playing',
						options: { output: out1 },
					},
				],
			},

			mark_in: {
				type: 'button',
				category: 'Clip Workflow',
				name: 'Mark In',
				style: { text: 'MARK\nIN', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 90, 160) },
				steps: [{ down: [{ actionId: 'mark_in', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			mark_out: {
				type: 'button',
				category: 'Clip Workflow',
				name: 'Mark Out',
				style: { text: 'MARK\nOUT', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 90, 160) },
				steps: [{ down: [{ actionId: 'mark_out', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			create_meta_mark: {
				type: 'button',
				category: 'Clip Workflow',
				name: 'Create Meta Mark',
				style: { text: 'META\nMARK', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(160, 80, 0) },
				steps: [
					{
						down: [
							{
								actionId: 'create_meta_mark',
								options: { output: out1, name: 'Mark' },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			create_clip: {
				type: 'button',
				category: 'Clip Workflow',
				name: 'Create Clip',
				style: { text: 'CREATE\nCLIP', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(140, 0, 140) },
				steps: [
					{
						down: [{ actionId: 'create_clip', options: { output: out1, name: '%C_%L_%i_%o', readable_id: '' } }],
						up: [],
					},
				],
				feedbacks: [],
			},

			recall_last_clip: {
				type: 'button',
				category: 'Clip Workflow',
				name: 'Recall Last Clip',
				style: { text: 'RECALL\nLAST', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(90, 0, 140) },
				steps: [{ down: [{ actionId: 'recall_last_clip', options: { output: out1, speed: 0 } }], up: [] }],
				feedbacks: [],
			},

			refresh_sessions: {
				type: 'button',
				category: 'System',
				name: 'Refresh Sessions',
				style: {
					text: 'REFRESH\nSESSIONS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [{ down: [{ actionId: 'refresh_sessions', options: {} }], up: [] }],
				feedbacks: [],
			},

			refresh_all_clips: {
				type: 'button',
				category: 'System',
				name: 'Refresh All Clips',
				style: {
					text: 'REFRESH\nALL CLIPS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [{ down: [{ actionId: 'refresh_all_clips', options: {} }], up: [] }],
				feedbacks: [],
			},

			cue_playlist_dropdown_preset: {
				type: 'button',
				category: 'Playlist Hotkeys',
				name: 'Cue Playlist Dropdown',
				style: {
					text: 'CUE\nPLAYLIST',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(45, 45, 120),
				},
				steps: [
					{
						down: [
							{
								actionId: 'cue_playlist_dropdown',
								options: { output: out1, playlist_id: this.defaultPlaylistId() },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			play_playlist_dropdown_preset: {
				type: 'button',
				category: 'Playlist Hotkeys',
				name: 'Play Playlist Dropdown',
				style: {
					text: 'PLAY\nPLAYLIST',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 120, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'play_playlist_dropdown',
								options: { output: out1, playlist_id: this.defaultPlaylistId() },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			cue_session_playlist_dropdown_preset: {
				type: 'button',
				category: 'Playlist Hotkeys',
				name: 'Cue Session Playlist Dropdown',
				style: {
					text: 'CUE SESSION\nPLAYLIST',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(45, 45, 120),
				},
				steps: [
					{
						down: [
							{
								actionId: 'cue_session_playlist_dropdown',
								options: {
									output: out1,
									session: this.defaultSessionId(),
									playlist_id: this.sessionPlaylists[0]?.id || '',
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			play_session_playlist_dropdown_preset: {
				type: 'button',
				category: 'Playlist Hotkeys',
				name: 'Play Session Playlist Dropdown',
				style: {
					text: 'PLAY SESSION\nPLAYLIST',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 120, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'play_session_playlist_dropdown',
								options: {
									output: out1,
									session: this.defaultSessionId(),
									playlist_id: this.sessionPlaylists[0]?.id || '',
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			refresh_playlists_preset: {
				type: 'button',
				category: 'System',
				name: 'Refresh Playlists',
				style: {
					text: 'REFRESH\nPLAYLISTS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [
					{
						down: [
							{
								actionId: 'refresh_playlists',
								options: { session: this.defaultSessionId() },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			cue_by_clip_name_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Cue Clip Name Dropdown',
				style: {
					text: 'CUE CLIP\nNAME DROPDOWN',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(45, 45, 120),
				},
				steps: [
					{
						down: [
							{
								actionId: 'cue_by_clip_name',
								options: {
									output: out1,
									clip_id: this.allClips[0]?.id || '',
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			play_by_clip_name_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Play Clip Name Dropdown',
				style: {
					text: 'PLAY CLIP\nNAME DROPDOWN',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 120, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'play_by_clip_name',
								options: {
									output: out1,
									clip_id: this.allClips[0]?.id || '',
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			cue_session_clip_dropdown_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Cue Session Clip Dropdown',
				style: {
					text: 'CUE SESSION\nCLIP DROPDOWN',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(45, 45, 120),
				},
				steps: [
					{
						down: [
							{
								actionId: 'cue_session_clip_dropdown',
								options: {
									output: out1,
									session: this.defaultSessionId(),
									clip_id: this.defaultSessionClipId(),
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			play_session_clip_dropdown_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Play Session Clip Dropdown',
				style: {
					text: 'PLAY SESSION\nCLIP DROPDOWN',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 120, 0),
				},
				steps: [
					{
						down: [
							{
								actionId: 'play_session_clip_dropdown',
								options: {
									output: out1,
									session: this.defaultSessionId(),
									clip_id: this.defaultSessionClipId(),
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			refresh_session_clips: {
				type: 'button',
				category: 'System',
				name: 'Refresh Session Clips',
				style: {
					text: 'REFRESH\nSESSION CLIPS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(50, 50, 50),
				},
				steps: [
					{ down: [{ actionId: 'refresh_session_clips', options: { session: this.defaultSessionId() } }], up: [] },
				],
				feedbacks: [],
			},

			cue_session_clip_by_pbs_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Cue Session Clip by PBS',
				style: {
					text: 'CUE SESSION\nCLIP BY PBS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(45, 45, 120),
				},
				steps: [
					{
						down: [
							{
								actionId: 'cue_session_clip_by_pbs',
								options: {
									output: out1,
									session: this.defaultSessionId(),
									page: 1,
									bank: 1,
									slot: 1,
									angle: 'A',
									speed: 0,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			play_session_clip_by_pbs_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Play Session Clip by PBS',
				style: {
					text: 'PLAY SESSION\nCLIP BY PBS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 100, 70),
				},
				steps: [
					{
						down: [
							{
								actionId: 'play_session_clip_by_pbs',
								options: { output: out1, session: this.defaultSessionId(), page: 1, bank: 1, slot: 1, angle: 'A' },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			cue_clip_hotkey_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Cue Clip by PBS',
				style: {
					text: 'CUE CLIP\nBY PBS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(45, 45, 120),
				},
				steps: [
					{
						down: [
							{
								actionId: 'cue_clip_by_page_bank_slot_angle',
								options: { output: out1, page: 1, bank: 2, slot: 3, angle: 'A', speed: 0 },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			play_clip_hotkey_preset: {
				type: 'button',
				category: 'Clip Hotkeys',
				name: 'Play Clip by PBS',
				style: {
					text: 'PLAY CLIP\nBY PBS',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 100, 70),
				},
				steps: [
					{
						down: [
							{
								actionId: 'play_clip_by_page_bank_slot_angle',
								options: { output: out1, page: 1, bank: 2, slot: 3, angle: 'A' },
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			route_input_out1: {
				type: 'button',
				category: 'Input Routing',
				name: 'Route Input to Output 1',
				style: {
					text: 'INPUT\nTO OUT 1',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 90, 120),
				},
				steps: [
					{
						down: [{ actionId: 'route_input_to_output', options: { input: this.defaultInputId(), output: out1 } }],
						up: [],
					},
				],
				feedbacks: [],
			},

			mosaic_custom_2box: {
				type: 'button',
				category: 'Mosaic',
				name: 'Mosaic Custom 2 Box',
				style: {
					text: 'MOSAIC\n2 BOX',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(60, 60, 130),
				},
				steps: [
					{
						down: [
							{
								actionId: 'set_mosaic_custom_layout',
								options: {
									output: out1,
									box_count: '2',
									border_thickness: 0,
									border_colour: '#000000',
									box1_id: this.defaultInputId(),
									box1_region_x: 0,
									box1_region_y: 0,
									box1_region_w: 1,
									box1_region_h: 1,
									box1_location_x: 0,
									box1_location_y: 0,
									box1_location_w: 0.5,
									box1_location_h: 1,
									box2_id: this.defaultInputId(),
									box2_region_x: 0,
									box2_region_y: 0,
									box2_region_w: 1,
									box2_region_h: 1,
									box2_location_x: 0.5,
									box2_location_y: 0,
									box2_location_w: 0.5,
									box2_location_h: 1,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			mosaic_custom_3box: {
				type: 'button',
				category: 'Mosaic',
				name: 'Mosaic Custom 3 Box',
				style: {
					text: 'MOSAIC\n3 BOX',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(60, 60, 130),
				},
				steps: [
					{
						down: [
							{
								actionId: 'set_mosaic_custom_layout',
								options: {
									output: out1,
									box_count: '3',
									border_thickness: 0,
									border_colour: '#000000',
									box1_id: this.defaultInputId(),
									box1_region_x: 0,
									box1_region_y: 0,
									box1_region_w: 1,
									box1_region_h: 1,
									box1_location_x: 0,
									box1_location_y: 0,
									box1_location_w: 0.3333,
									box1_location_h: 1,
									box2_id: this.defaultInputId(),
									box2_region_x: 0,
									box2_region_y: 0,
									box2_region_w: 1,
									box2_region_h: 1,
									box2_location_x: 0.3333,
									box2_location_y: 0,
									box2_location_w: 0.3333,
									box2_location_h: 1,
									box3_id: this.defaultInputId(),
									box3_region_x: 0,
									box3_region_y: 0,
									box3_region_w: 1,
									box3_region_h: 1,
									box3_location_x: 0.6666,
									box3_location_y: 0,
									box3_location_w: 0.3333,
									box3_location_h: 1,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			mosaic_custom_4box: {
				type: 'button',
				category: 'Mosaic',
				name: 'Mosaic Custom 4 Box',
				style: {
					text: 'MOSAIC\n4 BOX',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(60, 60, 130),
				},
				steps: [
					{
						down: [
							{
								actionId: 'set_mosaic_custom_layout',
								options: {
									output: out1,
									box_count: '4',
									border_thickness: 0,
									border_colour: '#000000',
									box1_id: this.defaultInputId(),
									box1_region_x: 0,
									box1_region_y: 0,
									box1_region_w: 1,
									box1_region_h: 1,
									box1_location_x: 0,
									box1_location_y: 0,
									box1_location_w: 0.5,
									box1_location_h: 0.5,
									box2_id: this.defaultInputId(),
									box2_region_x: 0,
									box2_region_y: 0,
									box2_region_w: 1,
									box2_region_h: 1,
									box2_location_x: 0.5,
									box2_location_y: 0,
									box2_location_w: 0.5,
									box2_location_h: 0.5,
									box3_id: this.defaultInputId(),
									box3_region_x: 0,
									box3_region_y: 0,
									box3_region_w: 1,
									box3_region_h: 1,
									box3_location_x: 0,
									box3_location_y: 0.5,
									box3_location_w: 0.5,
									box3_location_h: 0.5,
									box4_id: this.defaultInputId(),
									box4_region_x: 0,
									box4_region_y: 0,
									box4_region_w: 1,
									box4_region_h: 1,
									box4_location_x: 0.5,
									box4_location_y: 0.5,
									box4_location_w: 0.5,
									box4_location_h: 0.5,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			},

			mosaic_clear: {
				type: 'button',
				category: 'Mosaic',
				name: 'Clear Mosaic',
				style: { text: 'CLEAR\nMOSAIC', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [{ actionId: 'clear_mosaic_layout', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			black_out1: {
				type: 'button',
				category: 'Output Control',
				name: 'Black Output 1',
				style: { text: 'BLACK\nOUT 1', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(20, 20, 20) },
				steps: [{ down: [{ actionId: 'set_output_idle', options: { output: out1 } }], up: [] }],
				feedbacks: [],
			},

			play_first_two: {
				type: 'button',
				category: 'Multi-Output',
				name: 'Play First Two Outputs',
				style: { text: 'PLAY\nOUT 1+2', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(0, 120, 0) },
				steps: [{ down: [{ actionId: 'play', options: { output: firstTwo, speed: 100 } }], up: [] }],
				feedbacks: [],
			},

			black_first_two: {
				type: 'button',
				category: 'Multi-Output',
				name: 'Black First Two Outputs',
				style: {
					text: 'BLACK\nOUT 1+2',
					size: '14',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(20, 20, 20),
				},
				steps: [{ down: [{ actionId: 'set_output_idle', options: { output: firstTwo } }], up: [] }],
				feedbacks: [],
			},

			black_all: {
				type: 'button',
				category: 'Multi-Output',
				name: 'Black All Outputs',
				style: { text: 'BLACK\nALL', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(20, 20, 20) },
				steps: [{ down: [{ actionId: 'set_output_idle', options: { output: allOutputs } }], up: [] }],
				feedbacks: [],
			},
		}
	}

	private login(): void {
		this.send('login', { username: this.configData.username })
	}

	private refreshOutputs(): void {
		this.send('get_outputs', null)
	}

	private refreshInputs(): void {
		this.send('get_input_sources', null)
	}

	private refreshBins(): void {
		this.send('find_bins', { limit: 500 })
	}

	private refreshExportProfiles(): void {
		this.send('get_export_profiles', null)
	}

	private httpJsonRpc(method: string, params: any | null, callback: (result: any) => void): void {
		let url = `https://${this.configData.host}/api/jsonrpc?method=${encodeURIComponent(method)}`

		if (params !== null) {
			url += `&params=${encodeURIComponent(JSON.stringify(params))}`
		}

		this.log('info', `HTTP JSON-RPC ${method}`)

		https
			.get(url, { rejectUnauthorized: false }, (res) => {
				let body = ''

				this.log('debug', `HTTP ${method} status: ${res.statusCode}`)

				res.on('data', (chunk) => {
					body += chunk.toString()
				})

				res.on('end', () => {
					this.log('debug', `HTTP ${method} body: ${body.slice(0, 300)}`)
					try {
						const msg = JSON.parse(body)
						if (msg.error) {
							this.log('error', `HTTP JSON-RPC ${method} error: ${JSON.stringify(msg.error)}`)
							return
						}

						callback(msg.result)
					} catch (e) {
						this.log('error', `Could not parse HTTP JSON-RPC ${method} response: ${String(e)} / ${body.slice(0, 200)}`)
					}
				})
			})
			.on('error', (e) => {
				this.log('error', `HTTP JSON-RPC ${method} failed: ${String(e)}`)
			})
	}

	private refreshConnection(sessionId?: string): void {
		this.refreshOutputs()
		this.refreshInputs()
		this.refreshBins()
		this.refreshExportProfiles()
		this.refreshAllPlaylists()

		this.refreshSessions(() => {
			const targetSessionId = sessionId || this.defaultSessionId()

			if (targetSessionId) {
				this.refreshSessionClips(targetSessionId)
			} else {
				this.log('warn', 'No session available to refresh clip names')
			}
		})
	}

	private refreshSessions(afterRefresh?: () => void): void {
		this.httpJsonRpc('get_sessions', null, (result) => {
			const rawSessions = this.extractArray(result)

			this.sessions = rawSessions
				.map((s: any, index: number) => ({
					id: String(s.session_id || s.id || s.uuid || ''),
					name: String(s.name || s.label || s.title || `Session ${index + 1}`),
					clipIds: Array.isArray(s.session_clips) ? s.session_clips.map((clipId: any) => String(clipId)) : [],
				}))
				.filter((s: SessionInfo) => s.id.length > 0)

			this.sessionClips = []
			this.log('info', `Discovered ${this.sessions.length} DreamCatcher sessions`)
			this.refreshDefinitions()

			if (afterRefresh) {
				afterRefresh()
			}
		})
	}

	private refreshAllPlaylists(sessionId?: string): void {
		this.log('info', 'Fetching all playlists via HTTP')

		// Fetch local playlists
		this.httpJsonRpc('find_local_playlists', { name: '' }, (result) => {
			const rawPlaylists = this.extractArray(result)
			const seen = new Set<string>()
			this.playlists = rawPlaylists
				.map((p: any) => this.normalizePlaylist(p))
				.filter((p: PlaylistInfo) => {
					if (!p.id || seen.has(p.id)) return false
					seen.add(p.id)
					return true
				})

			this.log('info', `Discovered ${this.playlists.length} local playlists`)

			// Also fetch session playlists if a session is provided
			const targetSession = sessionId || this.defaultSessionId()
			if (targetSession) {
				this.httpJsonRpc('find_playlists', { session_id: targetSession, name: '' }, (result2) => {
					const rawSession = this.extractArray(result2)
					const seenSession = new Set<string>()
					this.sessionPlaylists = rawSession
						.map((p: any) => this.normalizePlaylist(p))
						.filter((p: PlaylistInfo) => {
							if (!p.id || seenSession.has(p.id)) return false
							seenSession.add(p.id)
							return true
						})

					this.log('info', `Discovered ${this.sessionPlaylists.length} session playlists`)
					this.refreshDefinitions()
				})
			} else {
				this.refreshDefinitions()
			}
		})
	}

	// Keep for targeted session playlist refresh
	private refreshSessionPlaylists(sessionId: string): void {
		if (!sessionId) {
			this.log('warn', 'No session selected for playlist refresh')
			return
		}

		this.log('info', `Fetching playlists for session ${sessionId}`)
		this.httpJsonRpc('find_playlists', { session_id: sessionId, name: '' }, (result) => {
			const rawPlaylists = this.extractArray(result)
			const seen = new Set<string>()
			this.sessionPlaylists = rawPlaylists
				.map((p: any) => this.normalizePlaylist(p))
				.filter((p: PlaylistInfo) => {
					if (!p.id || seen.has(p.id)) return false
					seen.add(p.id)
					return true
				})

			this.log('info', `Discovered ${this.sessionPlaylists.length} session playlists`)
			this.refreshDefinitions()
		})
	}

	private refreshAllClips(): void {
		this.httpJsonRpc('find_clips', { limit: 1000 }, (result) => {
			const rawClips = this.extractArray(result)

			this.allClips = rawClips
				.filter((clip: any) => {
					if (clip.placeholder === true) return false
					if (clip.primary === false) return false
					if (clip.clip_id && clip.clip_id === clip.record_train_id) return false
					if (clip.name && /^Input\d+$/i.test(String(clip.name))) return false
					return true
				})
				.map((clip: any) => {
					const id = String(clip.clip_id || clip.id || '')
					const name = String(clip.name || clip.dynamic_name || clip.readable_id || id)
					// Also store in clipNames for feedback display
					if (id && name) this.clipNames.set(id, name)
					return { id, name }
				})
				.filter((c: { id: string; name: string }) => c.id.length > 0)

			this.log('info', `Loaded ${this.allClips.length} clips for name-based cueing`)
			this.refreshDefinitions()
		})
	}

	private selectOutputs(mask: number): void {
		this.send('select_outputs', { selection_mask: mask })
	}

	private send(method: string, params: any = null): void {
		if (!this.tcp?.isConnected) {
			this.log('warn', `Not connected, cannot send ${method}`)
			return
		}

		const id = this.requestId++
		const msg: any = { jsonrpc: '2.0', method, id }

		if (params !== null) msg.params = params

		this.pending.set(id, method)

		const payload = JSON.stringify(msg) + '\r\n'
		this.log('debug', `TX ${payload.trim()}`)
		this.tcp.send(payload)
	}
}

runEntrypoint(DC, [])
