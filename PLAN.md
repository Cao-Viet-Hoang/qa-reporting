# Plan tính năng – Web báo cáo QC theo ngày

Web nhập báo cáo kiểm soát chất lượng theo mẫu `20261018- QAVLF-BM10.xls`.

- **Công nghệ:** HTML, CSS, JS thuần + Firebase Firestore (gói miễn phí Spark).
- **Thiết bị:** ưu tiên điện thoại (chụp ảnh trực tiếp), có giao diện riêng cho máy tính.
- **Chu kỳ:** mỗi lần nhập là 1 báo cáo theo ngày, không giới hạn số báo cáo.

---

## 1. Truy cập (mật khẩu)

- Màn hình đầu tiên chỉ có **1 ô mật khẩu**. Mật khẩu chính là **Firebase API key**.
- Nhập đúng thì vào web, key được ghi nhớ trên máy (localStorage) cho lần sau.
- Nhập sai thì báo "Mật khẩu không đúng".
- Có nút **Đăng xuất** để xoá key đã nhớ.
- Firestore rules phải đặt **mở vĩnh viễn**. Không dùng "test mode", vì chế độ này tự khoá sau 30 ngày.
- Lưu ý: cách này chỉ chặn người dùng thông thường, không bảo vệ dữ liệu trước người biết kỹ thuật.

## 2. Màn hình

| # | Màn hình | Chức năng |
|---|---|---|
| 1 | Nhập mật khẩu | 1 ô mật khẩu |
| 2 | Danh sách báo cáo | Sắp xếp theo ngày mới nhất, lọc theo khoảng ngày, tạo mới. Bấm vào để xem, sửa, xoá |
| 3 | Form báo cáo | Nhập Phần 1 (ý 1–7) và Phần 2 |
| 4 | Thống kê | Tỉ lệ chấp nhận NCC, nguyên nhân KPH, hình thức xử lý, theo khoảng ngày |
| 5 | Danh mục | Nhà cung cấp, Nguyên nhân KPH, Hình thức xử lý |

## 3. Form báo cáo

### Đầu form
- **Ngày báo cáo:** mặc định hôm nay.
- **Người báo cáo:** tự nhập, máy ghi nhớ cho lần sau.

### Phần 1: Kiểm soát chất lượng

Mỗi ý là một khối có thể thu gọn hoặc mở ra.

#### Ý 1. Kiểm tra nguyên liệu / nguyên vật liệu đầu vào
- Mỗi dòng gồm:
  - **NCC:** ô chọn có search nhanh (gõ vài chữ để hiện gợi ý từ danh mục).
  - **Sản phẩm:** tự nhập.
  - **Kết quả:** Đạt / Không đạt.
  - **Ghi chú:** tự nhập.
- Có nút **+ Thêm dòng** và nút xoá dòng.
- Một NCC có thể xuất hiện nhiều dòng.
- Mục đích: kiểm soát tỉ lệ chấp nhận lô hàng của từng NCC.

#### Ý 2. Vệ sinh cá nhân, BHLĐ nhân viên sản xuất
- Hiện sẵn toàn bộ nội dung cố định:
  - Phòng BHLĐ 1
  - Phòng BHLĐ 2
  - Phòng đóng gói gia vị
  - Phòng đóng gói dầu – xốt
  - Khu đóng gói mì
- Mỗi nội dung gồm:
  - **Kết quả:** Đạt / Không đạt.
  - **Hình ảnh của sự KPH:** chỉ hiện khi chọn **Không đạt**. Chụp trực tiếp hoặc tải ảnh lên, được nhiều ảnh, có ảnh xem trước và nút xoá.
  - **Ghi chú:** tự do.
- Không bắt buộc điền hết. Người dùng có thông tin gì thì điền nấy.

#### Ý 3. Vệ sinh các hạng mục khác
- Các cột giống ý 2.
- Nội dung cố định: Khu vực SX, Dụng cụ, Máy móc thiết bị, Kho.

#### Ý 4. Kiểm tra nhiệt độ kho bảo quản
- Nội dung cố định: Tủ mát, Kho NL, Kho BTP, Kho TP.
- Mỗi kho có 1 ô **Nhiệt độ thực tế** (°C, nhập được số âm).
- Không có ngưỡng cảnh báo.

#### Ý 5. Mẫu lưu
- Mỗi dòng gồm: **Tên sản phẩm** (tự nhập), **Lô hàng** (tự nhập), **Số lượng** (tự nhập).
- Có nút thêm và xoá dòng.

#### Ý 6. Kiểm soát line sản xuất
- Có nút **+ Thêm khu vực**. Tên khu vực tự nhập.
- Mỗi khu vực hiện sẵn 4 hạng mục: Thao tác, Thông số kỹ thuật, BTP, Thành phẩm.
- Mỗi hạng mục gồm **Kết quả** (chọn) và **Ghi chú** (mô tả không đạt).
- Không bắt buộc điền. Không có ảnh.

#### Ý 7. Kiểm tra xuất kho
- Mỗi dòng gồm: **Sản phẩm** (tự nhập), **Kết quả** (chọn), **Số lượng không đạt**, **Ghi chú**.
- Không có dòng mẫu sẵn. Có nút thêm và xoá dòng.

### Phần 2: Kiểm soát sự KPH
- Mỗi dòng gồm:
  - **Sự KPH:** tự nhập.
  - **Nguyên nhân:** chọn từ danh mục, có search nhanh.
  - **Hình thức xử lý:** chọn từ danh mục, có search nhanh.
  - **Số lượng.**
- Nếu giá trị đang gõ chưa có trong danh mục thì hiện tuỳ chọn **"+ Thêm '…' vào danh mục"** để thêm ngay trong form.
- Có nút thêm và xoá dòng.
- Không tự động tạo dòng từ các mục "Không đạt" ở Phần 1.
- Mục đích: tìm nguyên nhân KPH xuất hiện nhiều nhất.

### Hành vi chung
- Kết quả chọn bằng 2 nút lớn **Đạt / Không đạt**. Chọn Không đạt thì dòng được tô đỏ nhạt.
- Có 2 nút **Lưu nháp** và **Hoàn tất**. Báo cáo đã hoàn tất vẫn mở ra sửa được.
- Bản đang nhập được tự lưu tạm trên máy (localStorage), để không mất dữ liệu khi lỡ đóng trang hoặc mất mạng.

## 4. Thống kê (chọn khoảng ngày)

- **Tỉ lệ chấp nhận NCC (cách A):**
  - Mỗi dòng ở ý 1 tính là 1 lần kiểm.
  - Tỉ lệ = số lần Đạt / tổng số lần kiểm.
  - Bảng gồm NCC, Số lần kiểm, Số lần Đạt, %. Sắp xếp % từ thấp đến cao.
- **Nguyên nhân KPH:**
  - Số lần xuất hiện và tổng số lượng của từng nguyên nhân.
  - Biểu đồ cột ngang, nguyên nhân nhiều nhất nằm trên cùng.
- **Hình thức xử lý:** số lần sử dụng của từng hình thức.

## 5. Danh mục (sửa trên web)

- **Nhà cung cấp:** khởi tạo sẵn 19 NCC lấy từ file Excel:
  - CHOWON KITCHEN, PHONG VÂN, TRI KING, NAM DƯƠNG
  - HÀNG TIÊU DÙNG BIÊN HÒA, BÍCH CƠ, THỰC PHẨM NAUY, SỨC SỐNG MỚI
  - MUỐI THÀNH PHÁT, AJINOMOTO VIỆT NAM, BRENNTAG VIỆT NAM, PALDO VINA
  - VINA AROMA, TRÍ VIỆT PHÁT, HỢP TÁC XÃ THƯƠNG MẠI - SẢN XUẤT NÔNG NGHIỆP VINA
  - SAIGON VE WONG, THỰC PHẨM N F C (Nature), PHÚ CƯỜNG, MIHACO
- **Nguyên nhân KPH** và **Hình thức xử lý:** ban đầu trống. Thêm từ màn hình Danh mục hoặc ngay trong form.
- Mỗi mục có thể thêm, sửa tên, ẩn.
- Xoá chỉ là **ẩn (soft delete)**. Báo cáo lưu cả id lẫn tên tại thời điểm nhập, nên báo cáo cũ và thống kê không bị sai.

## 6. Lưu ảnh (gói miễn phí, không dùng Firebase Storage)

1. Trình duyệt nén ảnh: chiều dài nhất khoảng 1280px, JPEG chất lượng khoảng 70%.
2. Chuyển ảnh sang **base64**.
3. Nếu chuỗi dài hơn **900KB** thì cắt thành nhiều chunk, để dưới giới hạn 1MB/document.
4. Lưu các chunk vào `images/{imageId}/chunks/{n}` bằng **batch write**: lưu đủ tất cả hoặc không lưu phần nào.
5. Báo cáo chỉ lưu `imageId` và số chunk.
6. Khi xem: tải đủ các chunk, ghép lại rồi hiển thị. Ảnh chỉ tải khi người dùng bấm xem (lazy load).
7. Xoá ảnh hoặc xoá báo cáo thì xoá luôn các chunk.

Hạn mức gói Spark:
- 1GB dung lượng, tương đương khoảng 4.000–6.000 ảnh.
- 50.000 lượt đọc và 20.000 lượt ghi mỗi ngày.

## 7. Cấu trúc Firestore

```
reports/{reportId}
  date            : "YYYY-MM-DD"
  reporter        : string
  status          : "draft" | "done"
  incoming[]      : { supplierId, supplierName, product, result, note }        // ý 1
  hygienePersonal[]: { item, result, imageIds[], note }                        // ý 2
  hygieneOther[]  : { item, result, imageIds[], note }                         // ý 3
  temperature[]   : { item, value }                                            // ý 4
  samples[]       : { product, lot, quantity }                                 // ý 5
  lineAreas[]     : { area, items[]: { name, result, note } }                  // ý 6
  outbound[]      : { product, result, failQty, note }                         // ý 7
  nonconformities[]: { description, causeId, causeName, actionId, actionName, quantity } // Phần 2
  createdAt, updatedAt

images/{imageId}            : { chunkCount, createdAt }
images/{imageId}/chunks/{n} : { data: "<base64>" }

suppliers/{id} : { name, active }
ncCauses/{id}  : { name, active }
ncActions/{id} : { name, active }
```

`result` có giá trị `"pass" | "fail" | null`.

## 8. Thứ tự triển khai

1. Kết nối Firebase và màn hình nhập mật khẩu.
2. Danh mục (seed sẵn 19 NCC).
3. Form Phần 1 và Phần 2, chưa có ảnh.
4. Lưu ảnh base64 chia chunk.
5. Danh sách báo cáo.
6. Thống kê.
