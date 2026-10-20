; NEBULATOR installer (Inno Setup 6). Built by CI: ISCC /DAppVersion=0.2 /DStageDir=..\stage nebulator.iss
#ifndef AppVersion
  #define AppVersion "0.2"
#endif
#ifndef StageDir
  #define StageDir "..\stage"
#endif

[Setup]
AppId={{3F9C2A71-5B84-4D1E-9A6C-7E20B1D4C8F5}
AppName=NEBULATOR
AppVersion={#AppVersion}
AppPublisher=NEBULATOR
DefaultDirName={autopf}\NEBULATOR
DefaultGroupName=NEBULATOR
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=NEBULATOR-Setup
OutputDir=..\out
SetupIconFile=nebulator.ico
UninstallDisplayIcon={app}\nebulator-core.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#StageDir}\nebulator-core.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\resources\*"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\gameProfiles\*"; DestDir: "{app}\gameProfiles"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\NEBULATOR"; Filename: "{app}\nebulator-core.exe"
Name: "{group}\Uninstall NEBULATOR"; Filename: "{uninstallexe}"
Name: "{autodesktop}\NEBULATOR"; Filename: "{app}\nebulator-core.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\nebulator-core.exe"; Description: "Launch NEBULATOR"; Flags: nowait postinstall skipifsilent

[Code]
// ---- prerequisite checks -------------------------------------------------------------------
// NEBULATOR is built fully static (no Visual C++ redistributable, no .NET, nothing to install).
// It only needs things Windows / the GPU driver already provide, so we just check and explain.

function VulkanPresent(): Boolean;
begin
  Result := FileExists(ExpandConstant('{sys}\vulkan-1.dll'));
end;

function EdgePresent(): Boolean;
var
  p: String;
begin
  Result := False;
  p := ExpandConstant('{commonpf32}\Microsoft\Edge\Application\msedge.exe');
  if FileExists(p) then Result := True;
  p := ExpandConstant('{commonpf64}\Microsoft\Edge\Application\msedge.exe');
  if FileExists(p) then Result := True;
  if RegKeyExists(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}') then Result := True;
  if RegKeyExists(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}') then Result := True;
end;

function InitializeSetup(): Boolean;
var
  msg: String;
begin
  Result := True;
  if not VulkanPresent() then
  begin
    msg := 'No Vulkan driver was found on this PC.' + #13#10#13#10 +
           'NEBULATOR needs Vulkan to run games. It comes with your graphics driver (NVIDIA, AMD or Intel). ' +
           'You can install NEBULATOR now, but please update your graphics driver before launching a game.' + #13#10#13#10 +
           'Install anyway?';
    if MsgBox(msg, mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
  if Result and (not EdgePresent()) then
    MsgBox('Microsoft Edge was not found. NEBULATOR will open its menu in your default browser instead, which works but looks less like an app window.', mbInformation, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  dataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    dataDir := ExpandConstant('{userappdata}\NEBULATOR');
    if DirExists(dataDir) then
      if MsgBox('Also delete your NEBULATOR settings, saves, Skylanders collection and controller profiles?' + #13#10 + dataDir + #13#10#13#10 +
                'Your game files are never touched.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(dataDir, True, True, True);
  end;
end;
