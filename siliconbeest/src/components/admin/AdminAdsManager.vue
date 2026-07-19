<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAdvertisementsStore } from '@/stores/advertisements'
import {
  createAdvertisement,
  deleteAdvertisement,
  getAdminAdvertisements,
  updateAdvertisement,
  type AdvertisementInput,
} from '@/api/mastodon/advertisements'
import { uploadMedia } from '@/api/mastodon/media'
import type { AdminAdvertisement, AdvertisementFormat } from '@/types/advertisement'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const advertisementsStore = useAdvertisementsStore()

const advertisements = ref<AdminAdvertisement[]>([])
const loading = ref(true)
const error = ref('')
const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const imageFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const formFormat = ref<AdvertisementFormat>('text')
const formText = ref('')
const formImageMediaId = ref<string | null>(null)
const formImageUrl = ref<string | null>(null)
const formImageAlt = ref('')
const formStatusRef = ref('')
const formLinkUrl = ref('')
const formEnabled = ref(true)
const formStartsAt = ref('')
const formEndsAt = ref('')

const usesText = computed(() => formFormat.value === 'text' || formFormat.value === 'text_image')
const usesImage = computed(() => formFormat.value === 'image' || formFormat.value === 'text_image')
const usesStatus = computed(() => formFormat.value === 'status')

function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function resetForm() {
  editingId.value = null
  formFormat.value = 'text'
  formText.value = ''
  formImageMediaId.value = null
  formImageUrl.value = null
  formImageAlt.value = ''
  formStatusRef.value = ''
  formLinkUrl.value = ''
  formEnabled.value = true
  formStartsAt.value = ''
  formEndsAt.value = ''
  imageFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function openCreateForm() {
  resetForm()
  showForm.value = true
}

function openEditForm(advertisement: AdminAdvertisement) {
  editingId.value = advertisement.id
  formFormat.value = advertisement.format
  formText.value = advertisement.text ?? ''
  formImageMediaId.value = advertisement.image_media_attachment_id
  formImageUrl.value = advertisement.image_url
  formImageAlt.value = advertisement.image_alt_text
  formStatusRef.value = advertisement.status_id ?? ''
  formLinkUrl.value = advertisement.link_url ?? ''
  formEnabled.value = advertisement.enabled
  formStartsAt.value = toLocalDateTime(advertisement.starts_at)
  formEndsAt.value = toLocalDateTime(advertisement.ends_at)
  imageFile.value = null
  if (fileInput.value) fileInput.value.value = ''
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  resetForm()
}

function handleImage(event: Event) {
  imageFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function loadAdvertisements() {
  if (!auth.token) return
  loading.value = true
  error.value = ''
  try {
    const { data } = await getAdminAdvertisements(auth.token)
    advertisements.value = data
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : t('advertisement.admin.load_failed')
  } finally {
    loading.value = false
  }
}

async function saveAdvertisement() {
  if (!auth.token || saving.value) return
  error.value = ''
  saving.value = true
  try {
    let mediaId = formImageMediaId.value
    if (usesImage.value && imageFile.value) {
      const { data } = await uploadMedia(imageFile.value, {
        token: auth.token,
        description: formImageAlt.value,
      })
      mediaId = data.id
    }

    if (usesImage.value && !mediaId) {
      throw new Error(t('advertisement.admin.image_required'))
    }
    if (usesText.value && !formText.value.trim()) {
      throw new Error(t('advertisement.admin.text_required'))
    }
    if (usesStatus.value && !formStatusRef.value.trim()) {
      throw new Error(t('advertisement.admin.status_required'))
    }

    const input: AdvertisementInput = {
      format: formFormat.value,
      text: usesText.value ? formText.value.trim() : null,
      image_media_attachment_id: usesImage.value ? mediaId : null,
      image_alt_text: usesImage.value ? formImageAlt.value.trim() : '',
      status_ref: usesStatus.value ? formStatusRef.value.trim() : null,
      link_url: formLinkUrl.value.trim() || null,
      enabled: formEnabled.value,
      starts_at: toIsoDateTime(formStartsAt.value),
      ends_at: toIsoDateTime(formEndsAt.value),
    }

    if (editingId.value) {
      await updateAdvertisement(editingId.value, input, auth.token)
    } else {
      await createAdvertisement(input, auth.token)
    }
    advertisementsStore.invalidate()
    await loadAdvertisements()
    cancelForm()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : t('advertisement.admin.save_failed')
  } finally {
    saving.value = false
  }
}

async function removeAdvertisement(id: string) {
  if (!auth.token || !confirm(t('advertisement.admin.delete_confirm'))) return
  error.value = ''
  try {
    await deleteAdvertisement(id, auth.token)
    advertisementsStore.invalidate()
    advertisements.value = advertisements.value.filter((advertisement) => advertisement.id !== id)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : t('advertisement.admin.delete_failed')
  }
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString(locale.value) : t('advertisement.admin.no_limit')
}

onMounted(() => { void loadAdvertisements() })
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="sb-heading text-2xl text-slate-900 dark:text-white">{{ t('advertisement.admin.title') }}</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t('advertisement.admin.description') }}</p>
      </div>
      <button v-if="!showForm" type="button" class="sb-btn sb-btn-primary" @click="openCreateForm">
        {{ t('advertisement.admin.add') }}
      </button>
    </div>

    <div v-if="error" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" role="alert">
      {{ error }}
    </div>

    <section v-if="showForm" class="sb-card space-y-4 p-5">
      <h2 class="sb-heading text-lg text-slate-900 dark:text-white">
        {{ editingId ? t('advertisement.admin.edit') : t('advertisement.admin.add') }}
      </h2>

      <div>
        <label class="sb-label" for="advertisement-format">{{ t('advertisement.admin.format') }}</label>
        <select id="advertisement-format" v-model="formFormat" class="sb-input">
          <option value="text">{{ t('advertisement.format.text') }}</option>
          <option value="text_image">{{ t('advertisement.format.text_image') }}</option>
          <option value="image">{{ t('advertisement.format.image') }}</option>
          <option value="status">{{ t('advertisement.format.status') }}</option>
        </select>
      </div>

      <div v-if="usesText">
        <label class="sb-label" for="advertisement-text">{{ t('advertisement.admin.text') }}</label>
        <textarea id="advertisement-text" v-model="formText" rows="5" class="sb-input resize-y" />
      </div>

      <div v-if="usesImage" class="space-y-3">
        <div>
          <label class="sb-label" for="advertisement-image">{{ t('advertisement.admin.image') }}</label>
          <input id="advertisement-image" ref="fileInput" type="file" accept="image/*" class="sb-input" @change="handleImage" />
          <p v-if="editingId && formImageUrl" class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t('advertisement.admin.keep_image') }}</p>
        </div>
        <img v-if="formImageUrl && !imageFile" :src="formImageUrl" :alt="formImageAlt" class="max-h-52 rounded-xl object-contain" />
        <div>
          <label class="sb-label" for="advertisement-alt">{{ t('advertisement.admin.image_alt') }}</label>
          <input id="advertisement-alt" v-model="formImageAlt" type="text" class="sb-input" />
        </div>
      </div>

      <div v-if="usesStatus">
        <label class="sb-label" for="advertisement-status">{{ t('advertisement.admin.status') }}</label>
        <input id="advertisement-status" v-model="formStatusRef" type="text" class="sb-input" :placeholder="t('advertisement.admin.status_placeholder')" />
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t('advertisement.admin.status_hint') }}</p>
      </div>

      <div v-if="!usesStatus">
        <label class="sb-label" for="advertisement-link">{{ t('advertisement.admin.link') }}</label>
        <input id="advertisement-link" v-model="formLinkUrl" type="url" class="sb-input" placeholder="https://" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="sb-label" for="advertisement-start">{{ t('advertisement.admin.starts_at') }}</label>
          <input id="advertisement-start" v-model="formStartsAt" type="datetime-local" class="sb-input" />
        </div>
        <div>
          <label class="sb-label" for="advertisement-end">{{ t('advertisement.admin.ends_at') }}</label>
          <input id="advertisement-end" v-model="formEndsAt" type="datetime-local" class="sb-input" />
        </div>
      </div>

      <label class="flex cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
        <input v-model="formEnabled" type="checkbox" class="h-4 w-4 accent-brand-600" />
        {{ t('advertisement.admin.enabled') }}
      </label>

      <div class="flex gap-2">
        <button type="button" class="sb-btn sb-btn-primary" :disabled="saving" @click="saveAdvertisement">
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
        <button type="button" class="sb-btn sb-btn-secondary" :disabled="saving" @click="cancelForm">
          {{ t('common.cancel') }}
        </button>
      </div>
    </section>

    <LoadingSpinner v-if="loading" />
    <div v-else-if="advertisements.length === 0" class="sb-empty rounded-xl border border-outline px-6 dark:border-outline-dark">
      <p>{{ t('advertisement.admin.empty') }}</p>
    </div>
    <div v-else class="grid gap-4 xl:grid-cols-2">
      <article v-for="advertisement in advertisements" :key="advertisement.id" class="sb-card overflow-hidden">
        <img v-if="advertisement.image_url" :src="advertisement.image_url" :alt="advertisement.image_alt_text" class="max-h-64 w-full object-cover" loading="lazy" />
        <div class="space-y-3 p-4">
          <div class="flex items-center justify-between gap-3">
            <span class="sb-chip">{{ t(`advertisement.format.${advertisement.format}`) }}</span>
            <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="advertisement.enabled ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'">
              {{ advertisement.enabled ? t('advertisement.admin.active') : t('advertisement.admin.inactive') }}
            </span>
          </div>
          <p v-if="advertisement.text" class="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{{ advertisement.text }}</p>
          <p v-if="advertisement.status_id" class="break-all text-sm text-slate-600 dark:text-slate-300">{{ t('advertisement.admin.status') }}: {{ advertisement.status_id }}</p>
          <a v-if="advertisement.link_url" :href="advertisement.link_url" target="_blank" rel="noopener noreferrer" class="block truncate text-sm text-brand-600 dark:text-brand-400">{{ advertisement.link_url }}</a>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <dt>{{ t('advertisement.admin.starts_at') }}</dt><dd>{{ formatDate(advertisement.starts_at) }}</dd>
            <dt>{{ t('advertisement.admin.ends_at') }}</dt><dd>{{ formatDate(advertisement.ends_at) }}</dd>
          </dl>
          <div class="flex gap-2 pt-1">
            <button type="button" class="sb-btn sb-btn-secondary sb-btn-sm" @click="openEditForm(advertisement)">{{ t('common.edit') }}</button>
            <button type="button" class="sb-btn sb-btn-sm border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30" @click="removeAdvertisement(advertisement.id)">{{ t('common.delete') }}</button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
