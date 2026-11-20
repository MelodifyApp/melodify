import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";
import {
    getHomeSessionSnapshot,
    initializeHomeSession,
    subscribeHomeSession,
} from "../homeSession";
import {
    clearQueueHistory,
    getQueueHistory,
} from "../streamSessionRuntime";

ipcMain.handle("home:getSession", () => {
    initializeHomeSession();
    return getHomeSessionSnapshot();
});

ipcMain.handle("queue:getHistory", () => getQueueHistory());

ipcMain.handle("queue:clearHistory", () => ({
    ok: true,
    removed: clearQueueHistory(),
}));

ipcMain.handle("queue:exportHistory", async (event) => {
    const sessions = getQueueHistory();
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
        title: "Export queue history",
        defaultPath: `queue-history-${new Date()
            .toISOString()
            .slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
    };
    const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
        return { canceled: true };
    }
    fs.writeFileSync(
        result.filePath,
        JSON.stringify(
            {
                version: 1,
                exportedAt: new Date().toISOString(),
                sessions,
            },
            null,
            2
        ),
        "utf8"
    );
    return { canceled: false, path: result.filePath };
});

subscribeHomeSession((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
        sendToWindowIfAlive(window, "home:sessionUpdated", snapshot);
    }
});
