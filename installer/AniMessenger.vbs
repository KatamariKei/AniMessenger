Set shell = CreateObject("WScript.Shell")
launcher = Replace(WScript.ScriptFullName, "AniMessenger.vbs", "AniMessenger.cmd")
shell.Run Chr(34) & launcher & Chr(34), 0, False
