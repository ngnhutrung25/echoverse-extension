# Echoverse - Chrome Extension

**Echoverse** là Chrome extension nhắc nghỉ theo thời gian, có âm thanh, overlay toàn màn hình, và thống kê cơ bản. Mục tiêu: nhắc uống nước, đứng dậy, và giữ nhịp làm việc ổn định.

## Tính năng

- **Hourly**: nhắc mỗi giờ với message tùy chỉnh.
- **Recurring**: nhắc theo chu kỳ 15, 30, 45, hoặc 60 phút; có hỗ trợ giá trị custom.
- **Overlay toàn màn hình**: hiện lớp phủ với blur nền, nút **Skip**, **Snooze 5m**, và **Disable for today**.
- **Âm thanh**: bật/tắt âm thanh; chọn preset hoặc nhập `customAudioUrl`.
- **Stats**: xem số lần nhắc hôm nay và streak trong popup.
- **An toàn khi startup / wake**: browser khởi động hoặc máy thức dậy thì timer được reset, không bắn nhắc cũ.
- **Manifest V3**: dùng `chrome.alarms`, `chrome.runtime.onStartup`, `chrome.idle`, `offscreen`, và content script overlay.

<table>
  <tr>
    <td style="border: none; vertical-align: top;"><img src="assets/intro0.png" alt="Ảnh 1" style="width: 350px; object-fit: contain;"></td>
    <td style="border: none; vertical-align: top;"><img src="assets/intro1.png" alt="Ảnh 2" style="width: 350px; object-fit: contain;"></td>
  </tr>
</table>

## Cấu hình hiện tại

- **Tên app**: Echoverse
- **Phiên bản**: `0.5.0`
- **Background**: `service_worker` ở `background.js`
- **Content script**: `content/overlay.js` + `content/overlay.css`
- **Offscreen audio**: `offscreen.html` + `offscreen.js`

## Cách dùng

1. Mở icon Echoverse trên Chrome toolbar.
2. Chọn tab **Hourly** hoặc **Recurring**.
3. Nhập message, interval, preset âm thanh, hoặc `customAudioUrl` nếu cần.
4. Bấm **Start** để bật timer.
5. Khi đến hạn, notification, sound, và overlay sẽ xuất hiện.

## Quyền truy cập

Extension cần các quyền sau:

- **`notifications`**: hiển thị notification.
- **`storage`**: lưu settings, stats, và trạng thái timer.
- **`alarms`**: lên lịch nhắc.
- **`idle`**: phát hiện máy thức dậy để reset timer.
- **`offscreen`**: phát âm thanh.
- **`tabs`**: gửi message cho tab đang mở để hiện overlay.

## Cấu trúc file

- **`manifest.json`**: cấu hình extension.
- **`popup.html`** / **`popup.js`**: UI và logic popup.
- **`background.js`**: schedule, notification, stats, overlay message.
- **`content/overlay.js`** / **`content/overlay.css`**: overlay toàn màn hình.
- **`offscreen.html`** / **`offscreen.js`**: phát âm thanh notification.
- **`icons/`**: icon 16 / 48 / 128 / 512.
- **`assets/`**: ảnh giao diện và tài nguyên âm thanh.

## Ghi chú

- `soundPreset` hiện hỗ trợ `default`, `rain`, `bell`, `wind`.
- `messagePool` là nguồn text nhắc ngẫu nhiên.
- `dailyStats` và `streak` được lưu trong `chrome.storage.sync`.

## License

Dự án dùng MIT License. Xem [LICENSE](LICENSE).

Cảm ơn bạn đã dùng **Echoverse**.
