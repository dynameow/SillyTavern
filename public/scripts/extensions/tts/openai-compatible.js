import { event_types, eventSource, getRequestHeaders } from '../../../script.js';
import { SECRET_KEYS, secret_state } from '../../secrets.js';
import { getPreviewString, saveTtsProviderSettings } from './index.js';

export { OpenAICompatibleTtsProvider };

class OpenAICompatibleTtsProvider {
    settings;
    voices = [];
    separator = ' . ';

    audioElement = document.createElement('audio');
    audioContext = null;
    audioWorkletNode = null;
    streamReader = null;

    defaultSettings = {
        voiceMap: {},
        model: 'tts-1',
        speed: 1,
        available_voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        provider_endpoint: 'http://127.0.0.1:8000/v1/audio/speech',
        streaming: false,
        stream_format: 'wav',
        pcm_sample_rate: 24000,
        buffer_ms: 0,
        retry_badcase: true,
    };

    get settingsHtml() {
        let html = `
        <label for="openai_compatible_tts_endpoint">Provider Endpoint:</label>
        <div class="flex-container alignItemsCenter">
            <div class="flex1">
                <input id="openai_compatible_tts_endpoint" type="text" class="text_pole" maxlength="500" value="${this.defaultSettings.provider_endpoint}"/>
            </div>
            <div id="openai_compatible_tts_key" class="menu_button menu_button_icon manage-api-keys" data-key="api_key_custom_openai_tts">
                <i class="fa-solid fa-key"></i>
                <span>API Key</span>
            </div>
        </div>
        <label for="openai_compatible_model">Model:</label>
        <input id="openai_compatible_model" type="text" class="text_pole" maxlength="500" value="${this.defaultSettings.model}"/>
        <label for="openai_compatible_tts_voices">Available Voices (comma separated):</label>
        <input id="openai_compatible_tts_voices" type="text" class="text_pole" value="${this.defaultSettings.available_voices.join()}"/>
        <label for="openai_compatible_tts_speed">Speed: <span id="openai_compatible_tts_speed_output"></span></label>
        <input type="range" id="openai_compatible_tts_speed" value="1" min="0.25" max="4" step="0.05">
        <label for="openai_compatible_tts_streaming" class="checkbox_label alignItemsCenter flexGap5">
            <input id="openai_compatible_tts_streaming" type="checkbox" />
            <span>Streaming (requires provider support)</span>
        </label>
        <div class="flex gap10px marginBot10">
            <div class="flex1 flexFlowColumn">
                <label for="openai_compatible_tts_stream_format">Streaming Format:</label>
                <select id="openai_compatible_tts_stream_format">
                    <option value="wav">WAV</option>
                    <option value="pcm">PCM</option>
                </select>
            </div>
            <div class="flex1 flexFlowColumn">
                <label for="openai_compatible_tts_pcm_sample_rate">PCM Sample Rate (Hz):</label>
                <input id="openai_compatible_tts_pcm_sample_rate" type="number" class="text_pole" min="8000" max="96000" step="1" value="${this.defaultSettings.pcm_sample_rate}"/>
            </div>
        </div>
        <label for="openai_compatible_tts_retry_badcase" class="checkbox_label alignItemsCenter flexGap5">
            <input id="openai_compatible_tts_retry_badcase" type="checkbox" />
            <span>Retry Badcase (VoxCPM2; must be disabled for streaming)</span>
        </label>
        <label for="openai_compatible_tts_buffer_ms">Stream Buffer (ms, 0 = off): <span id="openai_compatible_tts_buffer_ms_output"></span></label>
        <input type="range" id="openai_compatible_tts_buffer_ms" value="800" min="0" max="3000" step="50">`;
        return html;
    }

    constructor() {
        this.handler = async function (/** @type {string} */ key) {
            if (key !== SECRET_KEYS.CUSTOM_OPENAI_TTS) return;
            $('#openai_compatible_tts_key').toggleClass('success', !!secret_state[SECRET_KEYS.CUSTOM_OPENAI_TTS]);
            await this.onRefreshClick();
        }.bind(this);
    }

    dispose() {
        [event_types.SECRET_WRITTEN, event_types.SECRET_DELETED, event_types.SECRET_ROTATED].forEach(event => {
            eventSource.removeListener(event, this.handler);
        });
    }

    async loadSettings(settings) {
        // Populate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.info('Using default TTS Provider settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = this.defaultSettings;

        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                throw `Invalid setting passed to TTS Provider: ${key}`;
            }
        }

        $('#openai_compatible_tts_endpoint').val(this.settings.provider_endpoint);
        $('#openai_compatible_tts_endpoint').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_model').val(this.defaultSettings.model);
        $('#openai_compatible_model').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_voices').val(this.settings.available_voices.join());
        $('#openai_compatible_tts_voices').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_speed').val(this.settings.speed);
        $('#openai_compatible_tts_speed').on('input', () => {
            this.onSettingsChange();
        });

        $('#openai_compatible_tts_speed_output').text(this.settings.speed);

        $('#openai_compatible_tts_streaming').prop('checked', this.settings.streaming);
        $('#openai_compatible_tts_streaming').on('change', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_stream_format').val(this.settings.stream_format);
        $('#openai_compatible_tts_stream_format').on('change', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_pcm_sample_rate').val(this.settings.pcm_sample_rate);
        $('#openai_compatible_tts_pcm_sample_rate').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_retry_badcase').prop('checked', this.settings.retry_badcase);
        $('#openai_compatible_tts_retry_badcase').on('change', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_buffer_ms').val(this.settings.buffer_ms);
        $('#openai_compatible_tts_buffer_ms_output').text(this.settings.buffer_ms);
        $('#openai_compatible_tts_buffer_ms').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_key').toggleClass('success', !!secret_state[SECRET_KEYS.CUSTOM_OPENAI_TTS]);
        [event_types.SECRET_WRITTEN, event_types.SECRET_DELETED, event_types.SECRET_ROTATED].forEach(event => {
            eventSource.on(event, this.handler);
        });

        await this.checkReady();

        console.debug('OpenAI Compatible TTS: Settings loaded');
    }

    onSettingsChange() {
        // Update dynamically
        this.settings.provider_endpoint = String($('#openai_compatible_tts_endpoint').val());
        this.settings.model = String($('#openai_compatible_model').val());
        this.settings.available_voices = String($('#openai_compatible_tts_voices').val()).split(',');
        this.settings.speed = Number($('#openai_compatible_tts_speed').val());
        this.settings.streaming = $('#openai_compatible_tts_streaming').is(':checked');
        this.settings.stream_format = String($('#openai_compatible_tts_stream_format').val());
        this.settings.pcm_sample_rate = Number($('#openai_compatible_tts_pcm_sample_rate').val()) || 24000;
        this.settings.retry_badcase = $('#openai_compatible_tts_retry_badcase').is(':checked');
        this.settings.buffer_ms = Number($('#openai_compatible_tts_buffer_ms').val()) || 0;
        $('#openai_compatible_tts_speed_output').text(this.settings.speed);
        $('#openai_compatible_tts_buffer_ms_output').text(this.settings.buffer_ms);
        saveTtsProviderSettings();
    }

    async checkReady() {
        this.voices = await this.fetchTtsVoiceObjects();
    }

    async onRefreshClick() {
        return;
    }

    async getVoice(voiceName) {
        if (this.voices.length == 0) {
            this.voices = await this.fetchTtsVoiceObjects();
        }
        const match = this.voices.filter(
            oaicVoice => oaicVoice.name == voiceName,
        )[0];
        if (!match) {
            throw `TTS Voice name ${voiceName} not found`;
        }
        return match;
    }

    async generateTts(text, voiceId) {
        const response = await this.fetchTtsGeneration(text, voiceId);

        if (this.settings.streaming) {
            await this.processStreamingAudio(response);
            // Return empty string since audio is already played via AudioWorklet
            return '';
        }

        return response;
    }

    async fetchTtsVoiceObjects() {
        return this.settings.available_voices.map(v => {
            return { name: v, voice_id: v, lang: 'en-US' };
        });
    }

    async previewTtsVoice(voiceId) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;

        const text = getPreviewString('en-US');
        const response = await this.fetchTtsGeneration(text, voiceId);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        if (this.settings.streaming) {
            await this.processStreamingAudio(response);
            return;
        }

        const audio = await response.blob();
        const url = URL.createObjectURL(audio);
        this.audioElement.src = url;
        this.audioElement.play();
        this.audioElement.onended = () => URL.revokeObjectURL(url);
    }

    async fetchTtsGeneration(inputText, voiceId) {
        console.info(`Generating new TTS for voice_id ${voiceId}`);
        const streaming = this.settings.streaming;
        const response = await fetch('/api/openai/custom/generate-voice', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                provider_endpoint: this.settings.provider_endpoint,
                model: this.settings.model,
                input: inputText,
                voice: voiceId,
                response_format: streaming ? this.settings.stream_format : 'mp3',
                speed: this.settings.speed,
                stream: streaming,
                retry_badcase: this.settings.retry_badcase,
            }),
        });

        if (!response.ok) {
            toastr.error(response.statusText, 'TTS Generation Failed');
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        return response;
    }

    async initAudioWorklet(wavSampleRate, suspendUntilPrimed = false) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: wavSampleRate });

        const processorUrl = './scripts/extensions/tts/lib/pcm-processor.js';
        await this.audioContext.audioWorklet.addModule(processorUrl);
        this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
        this.audioWorkletNode.connect(this.audioContext.destination);
        // Keep the context suspended until the initial buffer is primed so the
        // worklet does not pull/play audio before we have enough to avoid stutter.
        if (suspendUntilPrimed && this.audioContext.state === 'running') {
            await this.audioContext.suspend();
        }
    }

    async startBufferedPlayback() {
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    parseWavHeader(buffer) {
        const view = new DataView(buffer);
        const sampleRate = view.getUint32(24, true);
        const channels = view.getUint16(22, true);
        const bitsPerSample = view.getUint16(34, true);

        return { sampleRate, channels, bitsPerSample };
    }

    async processStreamingAudio(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('audio/') && !contentType.includes('octet-stream')) {
            const errorText = await response.text();
            toastr.error(errorText, 'TTS Generation Failed');
            throw new Error(`Unexpected streaming response: ${errorText}`);
        }

        const isRawPcm = this.settings.stream_format === 'pcm';
        const bufferMs = this.settings.buffer_ms || 0;
        const reader = response.body.getReader();
        this.streamReader = reader;
        let receivedAudio = false;
        let primed = false;
        let bytesNeeded = 0;
        let bufferedChunks = [];
        let isFirstChunk = true;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                receivedAudio = true;

                let pcmData = value;
                if (isFirstChunk) {
                    isFirstChunk = false;
                    if (isRawPcm) {
                        console.debug(`OpenAI Compatible TTS: raw PCM stream at ${this.settings.pcm_sample_rate} Hz`);
                        await this.initAudioWorklet(this.settings.pcm_sample_rate, bufferMs > 0);
                        // 16-bit mono PCM
                        bytesNeeded = Math.floor(this.settings.pcm_sample_rate * 2 * (bufferMs / 1000));
                    } else {
                        const wavInfo = this.parseWavHeader(value.buffer);
                        console.debug('OpenAI Compatible TTS: WAV stream info', wavInfo);
                        await this.initAudioWorklet(wavInfo.sampleRate, bufferMs > 0);
                        const byteRate = wavInfo.sampleRate * (wavInfo.channels || 1) * ((wavInfo.bitsPerSample || 16) / 8);
                        bytesNeeded = Math.floor(byteRate * (bufferMs / 1000));
                        // Skip WAV header (first 44 bytes typically)
                        pcmData = value.slice(44);
                    }
                }

                if (bufferMs > 0) {
                    if (!primed) {
                        bufferedChunks.push(pcmData);
                        const bufferedBytes = bufferedChunks.reduce((sum, c) => sum + c.byteLength, 0);
                        if (bufferedBytes < bytesNeeded) {
                            continue;
                        }
                        const merged = new Uint8Array(bufferedBytes);
                        let offset = 0;
                        for (const c of bufferedChunks) {
                            merged.set(c, offset);
                            offset += c.byteLength;
                        }
                        bufferedChunks = null;
                        primed = true;
                        pcmData = merged;
                        await this.startBufferedPlayback();
                    }

                    this.audioWorkletNode?.port.postMessage({ pcmData });
                    continue;
                }

                this.audioWorkletNode?.port.postMessage({ pcmData });
            }

            if (!primed && bufferedChunks) {
                const bufferedBytes = bufferedChunks.reduce((sum, c) => sum + c.byteLength, 0);
                if (bufferedBytes > 0) {
                    const merged = new Uint8Array(bufferedBytes);
                    let offset = 0;
                    for (const c of bufferedChunks) {
                        merged.set(c, offset);
                        offset += c.byteLength;
                    }
                    this.audioWorkletNode?.port.postMessage({ pcmData: merged });
                    await this.startBufferedPlayback();
                }
            }

            if (!receivedAudio) {
                throw new Error('Provider returned an empty audio stream. Check the server console for errors.');
            }
        } catch (error) {
            if (this.streamReader === reader) {
                toastr.error(error.toString(), 'TTS Generation Failed');
            }
            throw error;
        } finally {
            if (this.streamReader === reader) {
                this.streamReader = null;
            }
        }
    }

    stopStreaming() {
        if (this.streamReader) {
            this.streamReader.cancel().catch(() => { });
            this.streamReader = null;
        }

        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        if (this.audioContext) {
            this.audioContext.close().catch(() => { });
            this.audioContext = null;
        }
    }
}
