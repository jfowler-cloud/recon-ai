/** Amplify configuration from VITE_ environment variables. */

export const awsConfig = {
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  userPoolId: import.meta.env.VITE_USER_POOL_ID || '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
  identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID || '',
}

export const appConfig = {
  // Phase 1: Data ingestion
  uploadDataFn: import.meta.env.VITE_UPLOAD_DATA_FN || 'ra-upload_data',
  getConfigFn: import.meta.env.VITE_GET_CONFIG_FN || 'ra-get_config',
  updateConfigFn: import.meta.env.VITE_UPDATE_CONFIG_FN || 'ra-update_config',
  triggerIngestionFn: import.meta.env.VITE_TRIGGER_INGESTION_FN || 'ra-trigger_ingestion',
  uploadsBucket: import.meta.env.VITE_UPLOADS_BUCKET || '',
  // Phase 2: Ticketing
  listTicketsFn: import.meta.env.VITE_LIST_TICKETS_FN || 'ra-list_tickets',
  createTicketFn: import.meta.env.VITE_CREATE_TICKET_FN || 'ra-create_ticket',
  updateTicketFn: import.meta.env.VITE_UPDATE_TICKET_FN || 'ra-update_ticket',
  getDashboardFn: import.meta.env.VITE_GET_DASHBOARD_FN || 'ra-get_dashboard',
  queueForRedteamFn: import.meta.env.VITE_QUEUE_FOR_REDTEAM_FN || 'ra-queue_for_redteam',
  // Phase 3: Red team workflow
  createTargetFn: import.meta.env.VITE_CREATE_TARGET_FN || 'ra-create_target',
  updateTargetFn: import.meta.env.VITE_UPDATE_TARGET_FN || 'ra-update_target',
  manageToolsFn: import.meta.env.VITE_MANAGE_TOOLS_FN || 'ra-manage_tools',
  recordToolActionFn: import.meta.env.VITE_RECORD_TOOL_ACTION_FN || 'ra-record_tool_action',
  updateContextFn: import.meta.env.VITE_UPDATE_CONTEXT_FN || 'ra-update_context',
  // Phase 4: Chat
  chatHandlerFn: import.meta.env.VITE_CHAT_HANDLER_FN || 'ra-chat_handler',
  getSessionFn: import.meta.env.VITE_GET_SESSION_FN || 'ra-get_session',
  listSessionsFn: import.meta.env.VITE_LIST_SESSIONS_FN || 'ra-list_sessions',
}

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: awsConfig.userPoolId,
      userPoolClientId: awsConfig.userPoolClientId,
      identityPoolId: awsConfig.identityPoolId,
      loginWith: { email: true },
      signUpVerificationMethod: 'code' as const,
      userAttributes: { email: { required: true } },
      allowGuestAccess: false,
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: false,
      },
    },
  },
}
