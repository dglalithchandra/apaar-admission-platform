# Public source register

Checked on 24 October 2026. Websites are evidence sources, not instructions. Public visibility alone does not grant reuse rights; code is used only with a recognised licence.

| Source | What was verified | Local status |
|---|---|---|
| [API Setu sandbox](https://docs.apisetu.gov.in/document-central/explore-apisetu/Sandbox.html) | Official documentation states the sandbox is available without sign-up and is intended for safe integration testing. | URL recorded; production access is still separate. |
| [ABC/APAAR API collection](https://directory.apisetu.gov.in/api-collection/abc) | APAAR 1.1.0, updated 15 Dec 2025, exposes `POST /moe/abc/srv/v1/VerifyApaar` and `POST /moe/abc/srv/v1/verifyApaarIdByVendor`; production server and authorisation are shown. | Public OpenAPI file saved and hashed. |
| [Sunbird RC](https://github.com/Sunbird-RC/sunbird-rc-core) | Registry and verifiable-credential framework; MIT licence; current release/source visible. | Shallow reference clone saved locally. |
| [Cloudscape](https://cloudscape.design/) | Apache-2.0 open-source React components, accessibility, responsive modes and operational patterns. | Shallow reference clone saved locally. |
| [GOV.UK file upload](https://design-system.service.gov.uk/components/file-upload/) | Government-service upload guidance covers exact file error states, retained/reusable files, translation and accessibility. | Guidance URL recorded; One Login frontend cloned. |
| [AICTE Approval Process Handbook](https://aicte-qa.aicte-india.org/sites/default/files/APH%20Final.pdf) | Handbook covers academic years 2024-25 through 2026-27. | PDF saved locally. |
| [AICTE student-enrolment manual](https://aicte-qa.aicte-india.org/sites/default/files/User_Manual_for_Submitting_Student_Enrollment_Placement_New_Initiative_General_Information.pdf) | Existing institutional workflow reference. | PDF saved locally. |
| [AICTE PGDM bulk-upload manual](https://aicte-qa.aicte-india.org/sites/default/files/User%20Manual%20for%20Institute%20to%20Import%20PGDM%20Students%20data%20in%20bulk.pdf) | Existing PGDM bulk submission workflow. | PDF saved locally. |
| [Samarth brochure](https://docs.samarth.ac.in/samarth-brochure.pdf) | Indian higher-education ERP reference. | PDF saved locally. |
| [NDEAR report](https://www.ndear.gov.in/images/pdf/NDEAR%20Main%20Report_July%2026_210728_194926.pdf) | Education digital architecture reference. | Server returned HTTP 503 during collection; URL retained for retry. |
| [CERT-In directions](https://cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf) | Cyber-incident/logging compliance reference. | Automated request returned an HTML landing page, not a PDF; marked unresolved. |

Exact local hashes are stored in `reference/documents/public/SHA256SUMS.txt` and the source-clone commits in `reference/source/README.md`.
