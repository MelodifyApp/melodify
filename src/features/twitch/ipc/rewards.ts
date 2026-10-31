import { ipcMain } from "electron";
import { listTwitchRewardTitles } from "@/features/twitch/rewards";

/** Read-only custom reward titles for the Requests picker. */
ipcMain.handle("twitch:listRewardTitles", async () =>
    listTwitchRewardTitles()
);
