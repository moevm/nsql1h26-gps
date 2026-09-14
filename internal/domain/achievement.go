package domain

type Achievement struct {
	ID                int64
	Name              string
	Description       string
	Reward            string
	DependsOn         []*Quest
	TriggerEventTypes []*string
	Progress          interface{}
}
