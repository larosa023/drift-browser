; Drift registers itself as a browser for the current Windows user when it runs (see
; registerAsBrowser in src/main.js). Uninstalling removes that registration again.
; Updates run the old uninstaller too, so skip it then: the new version keeps the registration.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Drift"
    DeleteRegKey HKCU "Software\Classes\DriftHTML"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Drift"
    DeleteRegValue HKCU "Software\Classes\.htm\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.html\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.shtml\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.xht\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.xhtml\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.svg\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.webp\OpenWithProgids" "DriftHTML"
    DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "DriftHTML"
  ${endIf}
!macroend
