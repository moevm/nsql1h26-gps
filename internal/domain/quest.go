package domain

type Quest struct {
	ID                int64
	Name              string
	Description       string
	Reward            string
	Duration          string
	DependsOn         []*Quest
	TriggerEventTypes []*string
	Progress          interface{}
}
