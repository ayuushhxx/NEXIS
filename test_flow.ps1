$ErrorActionPreference = "Stop"

$apiUrl = "http://localhost:8787/api"
$phone = "+919999999999"

Write-Host "--- 1. OTP SEND ---"
$sendRes = Invoke-RestMethod -Uri "$apiUrl/otp/send" -Method Post -ContentType "application/json" -Body (@{ phoneNumber = $phone } | ConvertTo-Json)
Write-Host "Send Response:" ($sendRes | ConvertTo-Json)
$otp = $sendRes.otp

Write-Host "`n--- 2. OTP VERIFY ---"
$verifyRes = Invoke-RestMethod -Uri "$apiUrl/otp/verify" -Method Post -ContentType "application/json" -Body (@{ phoneNumber = $phone; code = $otp } | ConvertTo-Json)
Write-Host "Verify Response:" ($verifyRes | ConvertTo-Json)
$sessionToken = $verifyRes.sessionToken
$verificationToken = $verifyRes.verificationToken

Write-Host "`n--- 3. POST /api/consent (Initial) ---"
$consentBody = @{
    scope = "JOB_SEARCH_DATA"
    granted = $true
} | ConvertTo-Json
$consentRes = Invoke-RestMethod -Uri "$apiUrl/consent" -Method Post -Headers @{ Authorization = "Bearer $sessionToken" } -ContentType "application/json" -Body $consentBody
Write-Host "Consent Response:" ($consentRes | ConvertTo-Json)

Write-Host "`n--- 4. POST /api/trainee/profile ---"
$profileBody = @{
    phoneNumber = $phone
    name = "Test User"
    scheme = "Test Scheme"
    courseName = "Test Course"
    providerName = "Test Provider"
    cohortName = "Test Cohort"
    enrolmentDate = "2024-01-01"
    otpVerificationToken = $verificationToken
} | ConvertTo-Json
$profileRes = Invoke-RestMethod -Uri "$apiUrl/trainee/profile" -Method Post -Headers @{ Authorization = "Bearer $sessionToken" } -ContentType "application/json" -Body $profileBody
Write-Host "Profile Response:" ($profileRes | ConvertTo-Json)
$upgradedSessionToken = $profileRes.sessionToken

Write-Host "`n--- 5. GET /api/trainee/profile ---"
$getProfileRes = Invoke-RestMethod -Uri "$apiUrl/trainee/profile" -Method Get -Headers @{ Authorization = "Bearer $upgradedSessionToken" }
Write-Host "Get Profile Response:" ($getProfileRes | ConvertTo-Json)

Write-Host "`n--- 6. VERIFY ADMIN ROUTES REJECT NON-GITHUB TOKENS ---"
try {
    $adminRes = Invoke-RestMethod -Uri "$apiUrl/admin/dedup-candidates" -Method Get -Headers @{ Authorization = "Bearer $upgradedSessionToken" }
    Write-Host "FAIL: Admin route accepted trainee token!"
} catch {
    Write-Host "SUCCESS: Admin route correctly rejected trainee token. Exception: $_"
}

Write-Host "`n--- FLOW COMPLETED SUCCESSFULLY ---"
