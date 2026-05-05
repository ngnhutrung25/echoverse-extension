# Echoverse - Chrome Extension

**Echoverse** là Chrome extension nhắc nghỉ theo thời gian, có âm thanh, overlay toàn màn hình, và thống kê cơ bản. Mục tiêu: nhắc uống nước, đứng dậy, và giữ nhịp làm việc ổn định.

**Phiên bản**: `0.5.0`

## Tính năng

- **Hourly**: nhắc mỗi giờ với message tùy chỉnh.
- **Recurring**: nhắc theo chu kỳ số phút tuỳ chỉnh.
- **Overlay toàn màn hình**: hiện lớp phủ với blur nền, nút **Skip**, **Snooze 5m**, và **Disable for today**.
- **Âm thanh**: bật/tắt âm thanh.
- **Stats**: xem số lần nhắc đã thực hiện trong ngày.
- **An toàn khi startup / wake**: browser khởi động hoặc máy thức dậy thì timer được reset, không bắn nhắc cũ.
- **Manifest V3**: dùng `chrome.alarms`, `chrome.runtime.onStartup`, `chrome.idle`, `offscreen`, và content script overlay.
- **Message pool**: chọn ngẫu nhiên từ danh sách message đã định nghĩa.

## Quyền truy cập

Extension cần các quyền sau:

- **`notifications`**: hiển thị notification.
- **`storage`**: lưu settings, stats, và trạng thái timer.
- **`alarms`**: lên lịch nhắc.
- **`idle`**: phát hiện máy thức dậy để reset timer.
- **`offscreen`**: phát âm thanh.
- **`tabs`**: gửi message cho tab đang mở để hiện overlay.

## License

Dự án dùng MIT License. Xem [LICENSE](LICENSE).

Cảm ơn bạn đã dùng **Echoverse**.
