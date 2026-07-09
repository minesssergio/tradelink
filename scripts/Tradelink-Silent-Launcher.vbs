' Silently launches the Tradelink supervisor (start-tradelink.ps1) with no
' visible window — used by a shortcut in the Windows Startup folder.
' Run mode 0 = hidden window, False = don't wait for it to finish.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptDir & "\start-tradelink.ps1""", 0, False
