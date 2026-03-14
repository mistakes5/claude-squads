import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("squads", {
  // State & settings from main process
  onStateUpdate: (cb: (state: any) => void) => {
    ipcRenderer.on("state-update", (_e, state) => cb(state));
  },
  onSettingsUpdate: (cb: (settings: any) => void) => {
    ipcRenderer.on("settings-update", (_e, settings) => cb(settings));
  },

  // Interactive toggle — controls click-through
  enterInteractive: () => ipcRenderer.send("enter-interactive"),
  leaveInteractive: () => ipcRenderer.send("leave-interactive"),

  // Settings persistence
  saveSetting: (key: string, value: any) => ipcRenderer.send("save-setting", key, value),

  // Screen dimensions (sync call)
  getScreenSize: () => ipcRenderer.sendSync("get-screen-size") as { width: number; height: number },

  // GitHub OAuth
  triggerLogin: () => ipcRenderer.invoke("trigger-login"),
  triggerLogout: () => ipcRenderer.invoke("trigger-logout"),

  // Friends
  addFriend: (username: string) => ipcRenderer.invoke("add-friend", username),
  acceptFriend: (username: string) => ipcRenderer.invoke("accept-friend", username),

  // DMs
  sendDm: (friendId: string, content: string) => ipcRenderer.invoke("send-dm", friendId, content),

  // Squad invites
  inviteToSquad: (friendId: string) => ipcRenderer.invoke("invite-to-squad", friendId),
  acceptInvite: (roomSlug: string) => ipcRenderer.invoke("accept-invite", roomSlug),
});
