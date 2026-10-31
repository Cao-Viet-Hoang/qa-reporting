# Báo cáo QC theo ngày

Web app để nhập báo cáo kiểm soát chất lượng theo mẫu `20261018- QAVLF-BM10.xls`. App được viết bằng HTML, CSS và JavaScript thuần (ES modules), lưu dữ liệu trên Firebase Firestore gói Spark (miễn phí). App không cần build và không có framework.

Nghiệp vụ được mô tả trong [PLAN.md](PLAN.md).

---

## 1. Chạy thử trên máy

App dùng ES modules nên phải mở qua một HTTP server. Mở trực tiếp file `index.html` (`file://`) sẽ không chạy.

```bash
# Chọn một trong hai cách
python -m http.server 5173
npx serve -l 5173 .
```

Sau đó mở `http://localhost:5173`.

**Chế độ demo:** khi chưa cấu hình Firebase, màn hình mật khẩu có nút *“Xem bản demo với dữ liệu mẫu”*. Bản demo có khoảng 40 báo cáo mẫu và chạy đủ mọi chức năng. Dữ liệu demo chỉ nằm trong trình duyệt đó (localStorage + IndexedDB) và không bao giờ được gửi lên Firestore. Nếu đã cấu hình Firebase mà vẫn muốn xem demo, thêm `?demo` vào URL.

Muốn thử trên điện thoại cùng mạng Wi-Fi: chạy server với `--bind 0.0.0.0` rồi mở `http://<IP-máy-tính>:5173`. Lưu ý là chụp ảnh bằng camera cần HTTPS hoặc localhost. Khi chỉ mở bằng IP qua HTTP, nút “Chụp ảnh” sẽ mở trình chọn file thay vì camera.

## 2. Kết nối Firebase

1. Vào [Firebase Console](https://console.firebase.google.com) và tạo project.
2. Mục **Build → Firestore Database → Create database**. Chọn region gần (ví dụ `asia-southeast1`) và chọn **production mode**.
3. Tab **Rules**: dán nội dung file [firestore.rules](firestore.rules) rồi bấm **Publish**. Không dùng *test mode*, vì test mode tự khoá sau 30 ngày (PLAN.md §1).
4. Mục **Project settings → General → Your apps**: thêm một **Web app** và copy đoạn `firebaseConfig`.
5. Điền các giá trị vào [js/config/firebase-config.js](js/config/firebase-config.js): `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
   - **Không** điền `apiKey` vào file này. Theo PLAN.md, API key đóng vai trò *mật khẩu* và được nhập ở màn hình đầu tiên.
6. Mở app và nhập **API key** (`AIza…`) vào ô mật khẩu.
   - Nhập đúng thì vào được app, và key được nhớ trên máy (localStorage).
   - Nhập sai thì báo “Mật khẩu không đúng”.
7. Lần vào đầu tiên, app tự tạo sẵn 19 nhà cung cấp trong danh mục.

**Index:** truy vấn danh sách chỉ lọc và sắp xếp trên một trường `date`, nên Firestore dùng index tự động. Không cần tạo index thủ công.

**Deploy:** đây là các file tĩnh, có thể đưa lên Firebase Hosting, Netlify, GitHub Pages… Nên dùng HTTPS để camera trên điện thoại hoạt động.

## 3. Bảo mật & rủi ro (quan trọng)

Màn hình mật khẩu được làm đúng theo PLAN.md, nhưng **nó không phải là cơ chế bảo mật**:

- **Firebase API key không phải là bí mật.** Key chỉ dùng để định danh project. Ai có quyền vào app đã deploy đều có thể lấy được key từ request mạng.
- **localStorage không bảo vệ key.** Bất kỳ ai dùng trình duyệt đó, hoặc bất kỳ script nào chạy trên trang, đều đọc được key.
- **Firestore Rules đang mở hoàn toàn** (`allow read, write: if true`). Người biết `projectId` và API key có thể đọc, sửa, xoá **toàn bộ** dữ liệu, kể cả không dùng app.
- Màn hình mật khẩu chỉ chặn được người dùng thông thường (PLAN.md §1 đã ghi nhận điều này).

**Cách nâng cấp khi cần kiểm soát quyền truy cập thật:**

1. Bật **Firebase Authentication** (Email/Password, hoặc Google cho tài khoản công ty).
2. Thay màn hình mật khẩu bằng màn hình đăng nhập. Chỉ cần sửa `js/services/access-service.js`; các màn hình còn lại không phụ thuộc vào cách đăng nhập.
3. Siết rules, ví dụ:
   ```
   allow read, write: if request.auth != null
     && request.auth.token.email.matches('.*@congty[.]vn');
   ```
4. Có thể bật thêm **App Check** để giới hạn chỉ app của bạn mới gọi được Firestore.

## 4. Giới hạn gói Spark

| Hạn mức | Giá trị | Ảnh hưởng tới app |
|---|---|---|
| Dung lượng | 1 GiB | Mỗi ảnh sau khi nén khoảng 150–400 KB (base64), tức khoảng 4.000–6.000 ảnh |
| Lượt đọc | 50.000/ngày | Danh sách và thống kê đọc mọi báo cáo trong khoảng ngày (1 lượt/báo cáo). Ảnh **chỉ** được đọc khi bấm xem: (1 meta + N chunk) lượt/ảnh, sau đó được cache trên máy |
| Lượt ghi | 20.000/ngày | Mỗi lần lưu báo cáo tốn 1 lượt. Mỗi ảnh tốn 1 + số chunk lượt |
| Document | ≤ 1 MiB | Ảnh được cắt thành các chunk ≤ 900.000 ký tự |

Khoảng ngày mặc định là 30 ngày, để giữ số lượt đọc thấp. Chọn “Tất cả” sẽ đọc toàn bộ báo cáo.

## 5. Chức năng đã hoàn thành

| # | Chức năng | Ghi chú |
|---|---|---|
| 1 | Màn hình mật khẩu | Enter để gửi, có nút hiện/ẩn, có trạng thái loading và lỗi. Kiểm tra key bằng 1 lượt đọc thử |
| 2 | Kết nối Firestore | Modular SDK v10 (CDN gstatic), phân loại lỗi mạng / quyền / hạn mức |
| 3 | Seed 19 NCC | ID cố định (`seed-<slug>`) và dùng transaction, nên **không thể** tạo trùng dù mở trên nhiều máy |
| 4–5 | Danh mục nguyên nhân KPH | Ban đầu trống. Thêm được từ màn Danh mục hoặc ngay trong form |
| 6 | Phần 1, ý 1–7 | Mỗi ý là một khối thu gọn được. Khi đóng, khối hiện tóm tắt (số dòng, số không đạt, số ảnh) |
| 7 | Phần 2 – Sự KPH | Là vùng riêng. Không tự sinh dòng từ các mục “Không đạt” |
| 8 | Đạt / Không đạt | 2 nút lớn. Bấm lại nút đang chọn để bỏ chọn. Dòng không đạt được tô đỏ nhạt và có viền trái |
| 9 | Thêm/xoá dòng | Thêm dòng thì tự focus vào ô đầu. Xoá dòng có nút “Hoàn tác” |
| 10 | Tìm kiếm danh mục | Tìm không dấu (gõ “ajino”, “phu cuong” đều ra). Hỗ trợ phím ↑↓ Enter Esc. Gợi ý đẩy nội dung xuống, không che |
| 11 | Thêm nhanh danh mục | Mục “+ Thêm '…' vào danh mục”. Thêm xong thì tự chọn luôn. Nếu trùng tên với một mục đang ẩn thì hiện lại mục đó thay vì tạo mới |
| 12–13 | Lưu nháp / Hoàn tất | Hoàn tất có kiểm tra dữ liệu và tự mở đúng phần đang lỗi. Chỉ báo thành công sau khi Firestore xác nhận |
| 14 | Tự lưu trên máy | Debounce 700 ms. Mỗi báo cáo có một bản nháp riêng. Phân biệt rõ “Lưu trên máy” với “Đã đồng bộ” |
| 15 | Sửa báo cáo đã hoàn tất | Có nút “Lưu hoàn tất” hoặc “Chuyển về nháp” |
| 16 | Nén ảnh | Cạnh dài nhất ≤ 1280 px, JPEG 70%. Ảnh mới được giữ trong IndexedDB cho tới khi lưu báo cáo |
| 17 | Chunk ảnh trên Firestore | `images/{id}` + `chunks/{n}`, mỗi ảnh ghi trong một batch (tất cả hoặc không gì cả) |
| 18 | Lazy load ảnh | Ảnh cũ hiện ô “Xem” và chỉ tải khi bấm. Ảnh đã tải được cache trong IndexedDB |
| 19 | Xoá ảnh + chunks | Xoá chunks và meta qua một hàng đợi bền (localStorage), tự chạy lại khi khởi động hoặc khi có mạng |
| 20–22 | Danh sách báo cáo | Dạng timeline theo tháng, mỗi dòng có “dải 7 ý” cho biết ý nào đã nhập và ý nào không đạt. Mở rộng tại chỗ để xem chi tiết. Lọc khoảng ngày, xem/sửa/xoá có xác nhận |
| 23 | Tỉ lệ chấp nhận NCC | Theo cách A, sắp xếp % từ thấp đến cao. Đánh dấu NCC dưới 80% |
| 24 | Nguyên nhân KPH | Biểu đồ Pareto theo số lần, tô đậm nhóm nguyên nhân chiếm 80%, kèm bảng số liệu |
| 25 | Tổng quan & diễn biến | Hàng KPI (tỉ lệ chấp nhận chung, số lần kiểm, sự KPH, số NCC dưới 80%) và biểu đồ tỉ lệ chấp nhận + số sự KPH theo ngày/tuần/tháng |
| 26 | Soft delete danh mục | Ẩn / Hiện lại / Đổi tên. Báo cáo lưu cả `id` lẫn `tên` tại thời điểm nhập |

**Thêm ngoài PLAN:** chế độ demo, Ctrl/Cmd+S để lưu nháp, hỗ trợ dark mode, `prefers-reduced-motion`, nút ± để nhập số âm (vì bàn phím số trên điện thoại thường không có dấu trừ).

## 6. Bảo toàn dữ liệu – quy trình lưu

1. **Upload ảnh mới trước.** Mỗi ảnh ghi trong một batch riêng. ID các ảnh đã upload được ghi vào bản nháp (`uploadedUnsaved`).
2. **Lưu báo cáo.** Có timeout 25 giây. Chỉ báo thành công khi server xác nhận.
3. **Chỉ sau khi lưu thành công** mới xoá các ảnh không còn được tham chiếu (ảnh người dùng đã xoá, hoặc ảnh upload ở lần lưu thất bại trước).
4. Trước khi xoá một ảnh, hàng đợi đọc lại báo cáo sở hữu ảnh đó. Nếu báo cáo vẫn còn tham chiếu ảnh, ảnh sẽ **không** bị xoá.
5. Khi bỏ một bản nháp (“Bỏ thay đổi trên máy”), các ảnh đã upload nhưng chưa từng được báo cáo nào tham chiếu sẽ được dọn.
6. Xoá báo cáo thì xoá document báo cáo trước, rồi xoá từng ảnh (chunks + meta). Firestore **không** tự xoá subcollection khi xoá document cha.

## 7. Cấu trúc mã nguồn

```
index.html
firestore.rules
css/
  tokens.css         design tokens: màu, chữ, spacing, radius, shadow, motion, z-index (+ dark mode)
  base.css           reset + typography gốc
  components.css     button, input, result toggle, combobox, toast, dialog, ảnh, viewer, date range…
  layout.css         shell, navigation dạng viên thuốc mở rộng (header / bottom), page
  screens/*.css      login, reports, view, form (workspace), stats, catalog
js/
  main.js            khởi động, router → screen, đăng xuất
  config/            firebase-config.js (template), app-config.js (hằng số, khoá storage)
  core/              dom (hyperscript), router (hash), store, utils
  data/              firebase.js (khởi tạo SDK), backend-firestore.js, backend-demo.js, errors.js
  local/             storage (localStorage an toàn), drafts (bản nháp), idb (IndexedDB)
  images/            compress.js (resize, JPEG, base64, chia chunk)
  domain/            schema.js (nghiệp vụ, mapping form↔doc), validation, stats, report-summary
  services/          access, catalog, report, image, cleanup-queue
  ui/                shell, icons, combobox, result-toggle, image-field, image-viewer, dialog, toast, date-range, states
  screens/           login, reports, report-view, stats, catalog, report-form/ (screen, sections, fields)
  demo/              demo-data.js (dữ liệu mẫu có kiểm soát)
```

Các màn hình chỉ gọi `services/*`. `services` gọi `backend()`, một interface chung được hiện thực bởi cả Firestore lẫn demo. Toàn bộ nội dung nghiệp vụ cố định (các ý, hạng mục, 19 NCC, nhãn) chỉ được định nghĩa ở `js/domain/schema.js`.

## 8. Phần chưa làm / lưu ý

- **Kiểm tra mật khẩu:** vì Rules mở, Firestore chấp nhận *mọi* giá trị key, nên không thể dùng Firestore để kiểm tra mật khẩu. App gọi Identity Toolkit của Google: key sai trả về “API key not valid”, còn key đúng trả về phản hồi khác. Vì vậy trong DevTools sẽ thấy một request lỗi 400 tới `identitytoolkit.googleapis.com` mỗi lần đăng nhập — điều này là bình thường. Nếu sau này bật Firebase Authentication, cách kiểm tra này vẫn hoạt động.
- **Đã thử với project `qc-reporting-1e0a0`:** đăng nhập (key sai bị từ chối, key đúng vào được), ghi nhớ key sau khi reload, và seed 19 NCC. Các luồng lưu/xoá báo cáo và ảnh mới chỉ được kiểm thử trên backend demo, chưa chạy trên Firestore thật.
- **Lưu khi mất mạng:** khi ngoại tuyến, nút Lưu bị khoá và dữ liệu vẫn được giữ trên máy. App không tự đồng bộ ngầm khi có mạng lại; người dùng chủ động bấm Lưu. Cách này đảm bảo không bao giờ báo “đã lưu” khi Firestore chưa xác nhận.
- **Ghi đè đồng thời:** nếu hai người sửa cùng một báo cáo, người lưu sau sẽ ghi đè. App có cảnh báo khi bản trên hệ thống mới hơn bản nháp trên máy.
- **Ảnh HEIC** (iPhone): ảnh chụp trực tiếp từ camera trong trình duyệt luôn là JPEG nên không vấn đề. Riêng file HEIC chọn từ thư viện chỉ đọc được trên Safari.
- **Ảnh mồ côi do sự cố ngoài ý muốn:** nếu trình duyệt bị đóng *giữa* lúc upload ảnh và lúc lưu báo cáo, rồi bản nháp không bao giờ được mở lại hay bỏ đi, ảnh đó vẫn nằm trên Firestore. Metadata của ảnh có `reportId` để có thể viết script dọn dẹp sau này.
