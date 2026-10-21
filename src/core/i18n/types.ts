// Type definitions for translation files
// This ensures all language files have the same structure

export interface TranslationKeys {
    app: {
        name: string;
    };
    commands: {
        title: string;
        aliases: string;
        addAlias: string;
        prefixCharacter: string;
        chatReplies: string;
        availableCommands: string;
        noCommandsAvailable: string;
        noCommandsDescription: string;
        sendConfirmationMessage: string;
        sendMessageOnFailure: string;
        sendCurrentVolume: string;
        availableVariables: string;
        sr: {
            description: string;
            replyOnSuccess: string;
            replyOnError: string;
            successPlaceholder: string;
            errorPlaceholder: string;
            variables: string;
        };
        volume: {
            description: string;
            replyOnChange: string;
            replyOnError: string;
            replyOnGet: string;
            changePlaceholder: string;
            errorPlaceholder: string;
            getPlaceholder: string;
            variables: string;
        };
    };
    navigation: {
        homePage: string;
    };
    home: {
        songRequests: string;
        totalToday: string;
        byArtist: string;
        checkingUpdates: string;
        downloadingUpdate: string;
        updateReady: string;
        updateError: string;
        upToDate: string;
    };
    settings: {
        title: string;
        secrets: string;
        general: string;
        requests: string;
        commands: string;
        logs: string;
        debug: string;
    };
    general: {
        title: string;
        application: string;
        updates: string;
        language: string;
        interfaceLanguage: string;
        interfaceLanguageDesc: string;
        startWithSystem: string;
        startWithSystemDesc: string;
        minimizeToTray: string;
        minimizeToTrayDesc: string;
        autoUpdate: string;
        autoUpdateDesc: string;
        current: string;
        latest: string;
        checkUpdates: string;
        checking: string;
        downloadUpdate: string;
        installUpdate: string;
        downloading: string;
        errorDownloading: string;
        upToDate: string;
    };
    requests: {
        title: string;
        basicSettings: string;
        anyoneCanRequest: string;
        anyoneCanRequestDesc: string;
        commandPrefix: string;
        commandPrefixDesc: string;
        filePath: string;
        browse: string;
        currentSongDisplay: string;
        songFormatTemplate: string;
        availableVariables: string;
        saveCurrentSong: string;
        saveCurrentSongDesc: string;
        chatResponses: string;
        replyOnSongRequest: string;
        replyOnSongRequestDesc: string;
        successMessageTemplate: string;
        replyOnErrors: string;
        replyOnErrorsDesc: string;
        errorMessageTemplate: string;
        cooldowns: string;
        globalCooldown: string;
        globalCooldownDesc: string;
        globalCooldownDuration: string;
        perUserCooldown: string;
        perUserCooldownDesc: string;
        perUserCooldownDuration: string;
        seconds: string;
        replyOnCooldown: string;
        replyOnCooldownDesc: string;
        cooldownMessageTemplate: string;
        cooldownTemplateDesc: string;
    };
    authentication: {
        authenticated: string;
        notAuthenticated: string;
        connect: string;
        disconnect: string;
    };
    logs: {
        title: string;
        runtimeLogs: string;
        export: string;
        clear: string;
        searchPlaceholder: string;
        filterBy: string;
        showingResults: string;
        all: string;
        error: string;
        warnings: string;
        info: string;
        debug: string;
        logsRetentionNotice: string;
    };
    common: {
        save: string;
        cancel: string;
        close: string;
        loading: string;
        saved: string;
        saving: string;
        error: string;
        success: string;
        pleaseCompleteFields: string;
        secretsSaveError: string;
        secretsRequired: string;
        setupRequired: string;
        readyToConnect: string;
        listeningToChat: string;
        connectToChat: string;
        readyForRequests: string;
        startPlayingMusic: string;
        configured: string;
        notSet: string;
        checking: string;
        running: string;
        closed: string;
        runningOnAnotherDevice: string;
        active: string;
        inactive: string;
        activeListening: string;
        listenerStarted: string;
        eventDeliveryUnconfirmed: string;
        notConnected: string;
        connecting: string;
        refresh: string;
        retry: string;
        couldNotConnectToChat: string;
        configureCredentials: string;
    };
    statusCards: {
        api: string;
        app: string;
        auth: string;
        session: string;
        chatConnection: string;
    };
    setup: {
        configureKickAPI: string;
        configureSpotifyAPI: string;
        configureTwitchAPI: string;
        clientId: string;
        clientSecret: string;
        enterKickClientId: string;
        enterKickClientSecret: string;
        enterSpotifyClientId: string;
        enterSpotifyClientSecret: string;
        enterTwitchClientId: string;
        enterTwitchClientSecret: string;
        spotifyInstructions: string;
        spotifyInstructionsEnd: string;
        kickInstructions: string;
        kickInstructionsEnd: string;
        twitchInstructions: string;
        twitchInstructionsEnd: string;
        kickAdditionalInfo1: string;
        kickAdditionalInfo2: string;
        twitchAdditionalInfo1: string;
    };
    multipleInput: {
        placeholder: string;
        minLengthError: string;
        maxLengthError: string;
        duplicateError: string;
        maxItemsError: string;
        removeItem: string;
        itemCount: string;
    };
}

// Helper type to ensure all translation files match this structure
export type TranslationFile = TranslationKeys;
