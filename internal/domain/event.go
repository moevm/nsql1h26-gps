package domain

import "time"

type Event struct {
	ID          int64
	Type        string
	Description string
	Timestamp   time.Time
	Details     interface{} // К конкретному типу кастится подхватывающими сервисами, по event.Type
}
