import { BrowserWindow, ipcMain } from "electron";
import { sendToWindowIfAlive } from "@/shared/utils/windowSend";
import {
    getHomeSessionSnapshot,
    initializeHomeSession,
    subscribeHomeSession,
} from "../homeSession";

ipcMain.handle("home:getSession", () => {
    initializeHomeSession();
    return getHomeSessionSnapshot();
});

subscribeHomeSession((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
        sendToWindowIfAlive(window, "home:sessionUpdated", snapshot);
    }
});
