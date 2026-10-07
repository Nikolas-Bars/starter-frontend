import { ref } from 'vue'

import { ApiError } from '@/api/http'
import { t } from '@/i18n'
import type { ValidationErrors } from '@/types/api'

/**
 * Состояние отправки формы: флаг загрузки, общая ошибка и ошибки полей от бэкенда.
 */
export function useFormSubmit() {
  const loading = ref(false)
  const message = ref('')
  const fieldErrors = ref<ValidationErrors>({})

  function fieldError(field: string): string | undefined {
    return fieldErrors.value[field]?.[0]
  }

  async function submit(action: () => Promise<void>): Promise<boolean> {
    loading.value = true
    message.value = ''
    fieldErrors.value = {}

    try {
      await action()
      return true
    } catch (error) {
      if (error instanceof ApiError) {
        message.value = error.message
        fieldErrors.value = error.errors
      } else {
        message.value = t('errors.unknown')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  return { loading, message, fieldErrors, fieldError, submit }
}
