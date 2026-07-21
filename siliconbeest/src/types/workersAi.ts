export type WorkersAiToggleSetting = '0' | '1'

export interface WorkersAiAdminSettings {
  workers_ai_recommendation_enabled: WorkersAiToggleSetting
  workers_ai_translation_enabled: WorkersAiToggleSetting
  workers_ai_image_description_enabled: WorkersAiToggleSetting
}

export function createDefaultWorkersAiAdminSettings(): WorkersAiAdminSettings {
  return {
    workers_ai_recommendation_enabled: '0',
    workers_ai_translation_enabled: '0',
    workers_ai_image_description_enabled: '0',
  }
}
