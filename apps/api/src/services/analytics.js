export var AnalyticsEvent;
(function (AnalyticsEvent) {
    AnalyticsEvent["WORKSPACE_CREATED"] = "WORKSPACE_CREATED";
    AnalyticsEvent["UPLOAD_SUCCESS"] = "UPLOAD_SUCCESS";
    AnalyticsEvent["UPLOAD_FAILURE"] = "UPLOAD_FAILURE";
    AnalyticsEvent["CLEANUP_SUCCESS"] = "CLEANUP_SUCCESS";
    AnalyticsEvent["CLEANUP_FAILURE"] = "CLEANUP_FAILURE";
    AnalyticsEvent["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
})(AnalyticsEvent || (AnalyticsEvent = {}));
export function trackEvent(event, metadata = {}) {
    const log = {
        type: 'ANALYTICS',
        event,
        timestamp: new Date().toISOString(),
        ...metadata
    };
    console.log(JSON.stringify(log));
}
