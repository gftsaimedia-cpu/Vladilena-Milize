# So board design với FE

`*.dc.html` cần runtime của Design nên không mở thẳng được. `dcrender.mjs` là runtime mini: chạy `renderVals()` của board, thế các biến `{{...}}` và dựng lồng các `dc-import` (Main, BellInbox, BellAdvance, ...), đủ để chụp cả board nhúng. `shoot.mjs` chụp board và trang FE mock cùng kích thước.

Hạn chế: không có font và ảnh `/_blob/...` của board (font dự phòng), không có tương tác (chỉ trạng thái mở sẵn theo props như `sel`, `f`), các nút bấm xem trạng thái khác phải mở bằng route/`?hop=` của FE. Dùng để so bố cục, kích thước, màu, phần tử thiếu/thừa; không dùng so độ rộng chữ.
