#define AppName "PostGIS Manager"
#define AppPublisher "PostGIS Manager"
#define AppVersion GetEnv("APP_VERSION")
#define SourceDir "..\dist\PostGISManager"

[Setup]
AppId={{A2B95C5F-1F73-4D86-BC94-052C6CD98053}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\PostGISManager
DefaultGroupName={#AppName}
UninstallDisplayName={#AppName}
OutputDir=..\dist\installer
OutputBaseFilename=PostGISManager-Setup-{#AppVersion}
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
Uninstallable=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\PostGIS Manager"; Filename: "{app}\PostGISManager.exe"
Name: "{autodesktop}\PostGIS Manager"; Filename: "{app}\PostGISManager.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PostGISManager.exe"; Description: "Launch PostGIS Manager"; Flags: postinstall nowait skipifsilent
