export enum AnalyticsEvent {
  WORKSPACE_CREATED = 'WORKSPACE_CREATED',
  UPLOAD_SUCCESS = 'UPLOAD_SUCCESS',
  UPLOAD_FAILURE = 'UPLOAD_FAILURE',
  CLEANUP_SUCCESS = 'CLEANUP_SUCCESS',
  CLEANUP_FAILURE = 'CLEANUP_FAILURE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED'
}

export function trackEvent(event: AnalyticsEvent, metadata: Record<string, any> = {}) {
  const log = {
    type: 'ANALYTICS',
    event,
    timestamp: new Date().toISOString(),
    ...metadata
  }
  console.log(JSON.stringify(log))
}
