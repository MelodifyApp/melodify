import { ipcMain } from "electron";
import { listKickRewardTitles } from "@/features/kick/rewards";

/** Read-only channel reward titles for the Requests picker. */
ipcMain.handle("kick:listRewardTitles", async () => listKickRewardTitles());
