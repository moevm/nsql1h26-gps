package domain

import "time"

type UserCompletedQuest struct {
	UserID    int64
	QuestID   int64
	Timestamp time.Time
}

type UserFailedQuest struct {
	UserID    int64
	QuestID   int64
	Timestamp time.Time
}

type UserGotAchievement struct {
	UserID        int64
	AchievementID int64
	Timestamp     time.Time
}
