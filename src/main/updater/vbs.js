function escapeVbsString(value) {
    return String(value).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
}

function buildVbsScript({ installerPath, markerPath, logPath, pid, newVersion }) {
    const installer = escapeVbsString(installerPath);
    const marker = escapeVbsString(markerPath);
    const log = escapeVbsString(logPath);
    const targetPid = escapeVbsString(pid);
    const version = escapeVbsString(newVersion);

    return `
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

installerPath = "${installer}"
markerPath = "${marker}"
logPath = "${log}"
targetPid = "${targetPid}"
newVersion = "${version}"

Sub WriteLog(msg)
    On Error Resume Next
    Set f = fso.OpenTextFile(logPath, 8, True)
    f.WriteLine "[" & Now & "] " & msg
    f.Close
End Sub

Function IsProcessRunning(pid)
    On Error Resume Next
    Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")
    Set ps = wmi.ExecQuery("Select * from Win32_Process Where ProcessId=" & pid)
    IsProcessRunning = (ps.Count > 0)
End Function

WriteLog "VBS Script started"
WriteLog "Installer: " & installerPath
WriteLog "Waiting for PID: " & targetPid

' Wait for app to exit (max 30 seconds)
waitCount = 0
Do While IsProcessRunning(targetPid) And waitCount < 30
    WScript.Sleep 1000
    waitCount = waitCount + 1
Loop

WriteLog "App exited, waiting 2 seconds..."
WScript.Sleep 2000

' Check installer exists
If Not fso.FileExists(installerPath) Then
    WriteLog "ERROR: Installer not found: " & installerPath
    MsgBox "Installer not found!", vbCritical, "Update Error"
    WScript.Quit 1
End If

WriteLog "Starting installer..."

' Run installer and wait
ret = WshShell.Run("""" & installerPath & """", 1, True)

WriteLog "Installer finished with code: " & ret

' Create marker file
Set f = fso.CreateTextFile(markerPath, True)
f.WriteLine "{""version"":""" & newVersion & """,""time"":""" & Now & """,""ok"":true}"
f.Close

WriteLog "Update complete"

' Cleanup
On Error Resume Next
fso.DeleteFile WScript.ScriptFullName
`;
}

module.exports = { escapeVbsString, buildVbsScript };
